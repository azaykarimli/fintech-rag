// Shared domain types. Kept small and immutable on purpose.

/** A Result type instead of throwing: callers must handle the failure branch. */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Who is asking. In a real system this comes from a verified JWT, never from the client body. */
export interface Principal {
  readonly userId: string;
  readonly tenant: string;          // e.g. "public" | "internal"
  readonly roles: readonly string[]; // e.g. ["support"]
}

/** A source document as ingested from disk (or, in production, from a Kafka topic). */
export interface SourceDoc {
  readonly id: string;
  readonly title: string;
  readonly tenant: string;
  readonly roles: readonly string[];
  readonly body: string;
}

/** A retrievable unit. Access-control metadata is copied onto every chunk. */
export interface Chunk {
  readonly id: string;         // `${docId}#${index}`
  readonly docId: string;
  readonly title: string;
  readonly tenant: string;
  readonly roles: readonly string[];
  readonly index: number;
  readonly text: string;
  readonly contentHash: string;
}

export interface ScoredChunk extends Chunk {
  readonly score: number;
}

export interface Citation {
  readonly chunkId: string;
  readonly title: string;
}

export interface Answer {
  readonly answer: string;
  readonly citations: readonly Citation[];
  readonly refused: boolean;
  readonly metrics: Metrics;
}

export interface Metrics {
  readonly latencyMs: number;
  readonly retrievedChunks: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly estimatedCostUsd: number;
  readonly model: string;
}
