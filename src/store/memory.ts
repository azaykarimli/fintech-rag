// In-memory store with the same hybrid (vector + keyword) behaviour as the Postgres one.
// Good for tests and for understanding the algorithm without infrastructure.

import type { Chunk, ScoredChunk } from "../types.js";
import { canAccess, rrf, type SearchQuery, type VectorStore } from "./store.js";

const cosine = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

export const createMemoryStore = (): VectorStore => {
  const rows = new Map<string, { chunk: Chunk; embedding: readonly number[] }>();

  return {
    name: "memory",
    async init() {},

    async upsert(chunks, embeddings) {
      let inserted = 0, skipped = 0;
      chunks.forEach((chunk, i) => {
        const existing = rows.get(chunk.id);
        if (existing && existing.chunk.contentHash === chunk.contentHash) { skipped++; return; }
        rows.set(chunk.id, { chunk, embedding: embeddings[i]! });
        inserted++;
      });
      return { inserted, skipped };
    },

    async search(q: SearchQuery): Promise<ScoredChunk[]> {
      // 1. Access filter FIRST. Chunks the caller may not see never enter the ranking.
      const visible = [...rows.values()].filter((r) => canAccess(q.principal, r.chunk));

      // 2. Vector ranking.
      const byVector = visible
        .map((r) => ({ id: r.chunk.id, s: cosine(q.embedding, r.embedding) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id);

      // 3. Keyword ranking (stands in for Postgres full-text search).
      const qWords = new Set(words(q.text));
      const byKeyword = visible
        .map((r) => ({ id: r.chunk.id, s: words(r.chunk.text).filter((w) => qWords.has(w)).length }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id);

      // 4. Fuse and take top-k.
      const fused = rrf([byVector, byKeyword]);
      return [...fused.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, q.topK)
        .map(([id, score]) => ({ ...rows.get(id)!.chunk, score }));
    },

    async close() {},
  };
};
