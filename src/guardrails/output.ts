// Output guardrails: the model's reply is untrusted input to the rest of the system.
// We (1) parse it against a strict schema and (2) check that every citation points to a
// chunk we actually gave the model. A "grounded" answer that cites nothing is refused.

import { z } from "zod";
import { err, ok, type Citation, type Result, type ScoredChunk } from "../types.js";

export const AnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  citations: z.array(z.string()).max(10),
  refused: z.boolean(),
});
export type RawAnswer = z.infer<typeof AnswerSchema>;

export interface GuardedAnswer {
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly refused: boolean;
}

export const guardOutput = (rawJson: string, context: readonly ScoredChunk[]): Result<GuardedAnswer> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return err("model returned non-JSON");
  }
  const r = AnswerSchema.safeParse(parsed);
  if (!r.success) return err(`schema violation: ${r.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);

  const byId = new Map(context.map((c) => [c.id, c]));
  const known = r.data.citations.filter((id) => byId.has(id));
  const hallucinatedCitations = r.data.citations.length - known.length;
  if (hallucinatedCitations > 0) return err(`model cited ${hallucinatedCitations} unknown chunk id(s)`);

  if (!r.data.refused && known.length === 0) {
    // Groundedness rule: a substantive answer must cite at least one retrieved chunk.
    return ok({ answer: "I can't answer that from the available documents.", citations: [], refused: true });
  }

  return ok({
    answer: r.data.answer,
    refused: r.data.refused,
    citations: known.map((id) => ({ chunkId: id, title: byId.get(id)!.title })),
  });
};
