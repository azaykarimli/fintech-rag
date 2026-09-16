// Deterministic offline provider. Lets the whole pipeline (ingest -> retrieve -> guard ->
// answer -> eval) run with no API key and no network, which is exactly what you want in CI.
//
// Embeddings: a bag-of-words hash projection. Crude, but semantically "close enough" that
// keyword-heavy questions retrieve the right chunk.
// Chat: extracts the sentence(s) from the context that overlap most with the question and
// returns them as a grounded JSON answer with citations, or refuses if nothing matches.

import { createHash } from "node:crypto";
import type { ChatMessage, ChatResult, LlmProvider } from "./provider.js";

const DIM = 256;

const STOPWORDS = new Set([
  "the", "and", "for", "what", "which", "when", "how", "does", "did", "should", "must", "with",
  "that", "this", "from", "have", "has", "are", "was", "who", "per", "any", "our", "your", "got",
]);

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

const hashToIndex = (token: string): number => {
  const h = createHash("sha1").update(token).digest();
  return h.readUInt32BE(0) % DIM;
};

export const mockEmbed = (text: string): number[] => {
  const v = new Array<number>(DIM).fill(0);
  for (const t of tokenize(text)) v[hashToIndex(t)]! += 1;
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

const extractSection = (content: string, tag: string): string => {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m?.[1]?.trim() ?? "";
};

export const createMockProvider = (): LlmProvider => ({
  name: "mock",

  async embed(texts) {
    return texts.map(mockEmbed);
  },

  async chatJson(messages: readonly ChatMessage[]): Promise<ChatResult> {
    const user = messages.find((m) => m.role === "user")?.content ?? "";
    const question = extractSection(user, "question");
    const contextBlock = extractSection(user, "context");
    const qTokens = new Set(tokenize(question));

    // Context arrives as repeated <chunk id="...">text</chunk> blocks.
    const chunks = [...contextBlock.matchAll(/<chunk id="([^"]+)">([\s\S]*?)<\/chunk>/g)].map(
      (m) => ({ id: m[1]!, text: m[2]!.trim() }),
    );

    // Score each markdown section (heading + body) by keyword overlap with the question.
    // Exact matches on fintech codes (AC04, MD06, ...) are weighted heavily, as a real
    // model would treat them as the most informative tokens.
    const isCode = (t: string) => /^[a-z]{2}\d{2}$/.test(t);
    const contentTokens = [...qTokens].filter((t) => !STOPWORDS.has(t));
    type Best = { id: string; section: string; overlap: number; codes: number };
    let best: Best | undefined;
    for (const c of chunks) {
      // Every chunk is prefixed with the document title; ignore those tokens so the title
      // does not make the intro section win over the specific section that answers.
      const titleTokens = new Set(tokenize(c.text.split("\n")[0] ?? ""));
      for (const section of c.text.split(/\n(?=#+ )/)) {
        const sTokens = new Set(tokenize(section).filter((t) => !titleTokens.has(t)));
        const overlap = contentTokens.filter((t) => sTokens.has(t)).length;
        const codes = contentTokens.filter((t) => isCode(t) && sTokens.has(t)).length;
        const score = overlap + 3 * codes;
        if (!best || score > best.overlap + 3 * best.codes) best = { id: c.id, section: section.trim(), overlap, codes };
      }
    }

    const confident =
      best !== undefined &&
      (best.codes > 0 || (best.overlap >= 2 && best.overlap / Math.max(contentTokens.length, 1) >= 0.34));

    const payload = confident
      ? { answer: best!.section.replace(/^#+\s*/, "").slice(0, 600), citations: [best!.id], refused: false }
      : { answer: "I don't have enough information in the provided documents to answer that.", citations: [], refused: true };

    const text = JSON.stringify(payload);
    return {
      text,
      promptTokens: Math.round(user.length / 4),
      completionTokens: Math.round(text.length / 4),
      model: "mock-1",
    };
  },
});
