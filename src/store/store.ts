import type { Chunk, Principal, ScoredChunk } from "../types.js";

export interface SearchQuery {
  readonly embedding: readonly number[];
  readonly text: string;
  readonly principal: Principal; // access control is enforced INSIDE the store, not after
  readonly topK: number;
}

export interface VectorStore {
  readonly name: string;
  init(): Promise<void>;
  /** Idempotent: re-ingesting an unchanged chunk (same contentHash) is a no-op. */
  upsert(chunks: readonly Chunk[], embeddings: readonly (readonly number[])[]): Promise<{ inserted: number; skipped: number }>;
  search(q: SearchQuery): Promise<ScoredChunk[]>;
  close(): Promise<void>;
}

/** Can this principal see this chunk? The single place the access rule lives. */
export const canAccess = (p: Principal, c: { tenant: string; roles: readonly string[] }): boolean =>
  (c.tenant === "public" || c.tenant === p.tenant) && c.roles.some((r) => p.roles.includes(r));

/** Reciprocal Rank Fusion: merge two rankings without having to calibrate their scores. */
export const rrf = (rankings: readonly (readonly string[])[], k = 60): Map<string, number> => {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return scores;
};
