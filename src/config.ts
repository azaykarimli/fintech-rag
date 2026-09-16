import "dotenv/config";

const env = (key: string, fallback = ""): string => process.env[key] ?? fallback;

export const config = {
  openaiApiKey: env("OPENAI_API_KEY"),
  chatModel: env("CHAT_MODEL", "gpt-4o-mini"),
  embeddingModel: env("EMBEDDING_MODEL", "text-embedding-3-small"),
  databaseUrl: env("DATABASE_URL"),
  port: Number(env("PORT", "3000")),

  // Retrieval knobs. These are the things you tune against the eval suite, not by feel.
  chunkSizeChars: 900,
  chunkOverlapChars: 150,
  topK: 6,
  minRelevanceScore: 0.01,

  // Rough public list prices (USD per 1M tokens) used only for cost observability.
  prices: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 2.5, output: 10 },
    "text-embedding-3-small": { input: 0.02, output: 0 },
  } as Record<string, { input: number; output: number }>,
} as const;

export const useMockLlm = (): boolean => config.openaiApiKey.trim() === "";
export const useMemoryStore = (): boolean => config.databaseUrl.trim() === "";
