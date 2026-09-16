// Ingestion: read documents, chunk, embed in batches, upsert idempotently.
//
// In production this function would be the handler of a Kafka consumer on a
// `documents.updated` topic instead of a directory walk. Everything after "we have a
// SourceDoc" stays exactly the same — that boundary is deliberate.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import type { LlmProvider } from "../llm/index.js";
import type { VectorStore } from "../store/index.js";
import type { SourceDoc } from "../types.js";
import { chunkDoc, parseDoc } from "./chunk.js";

export const loadDocsFromDir = async (dir: string): Promise<SourceDoc[]> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  const docs: SourceDoc[] = [];
  for (const f of files) {
    const parsed = parseDoc(await readFile(join(dir, f), "utf8"));
    if (parsed.ok) docs.push(parsed.value);
    else console.warn(`skip ${f}: ${parsed.error}`);
  }
  return docs;
};

export const ingestDocs = async (
  docs: readonly SourceDoc[],
  llm: LlmProvider,
  store: VectorStore,
): Promise<{ docs: number; chunks: number; inserted: number; skipped: number }> => {
  const chunks = docs.flatMap((d) => chunkDoc(d, config.chunkSizeChars, config.chunkOverlapChars));

  const BATCH = 64;
  let inserted = 0, skipped = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await llm.embed(batch.map((c) => c.text));
    const r = await store.upsert(batch, embeddings);
    inserted += r.inserted;
    skipped += r.skipped;
  }
  return { docs: docs.length, chunks: chunks.length, inserted, skipped };
};
