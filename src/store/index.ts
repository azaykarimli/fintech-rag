import { useMemoryStore } from "../config.js";
import { createMemoryStore } from "./memory.js";
import { createPostgresStore } from "./postgres.js";
import type { VectorStore } from "./store.js";

export const createStore = (embeddingDim: number): VectorStore =>
  useMemoryStore() ? createMemoryStore() : createPostgresStore(embeddingDim);

export type { VectorStore } from "./store.js";
