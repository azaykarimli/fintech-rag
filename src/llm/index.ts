import { useMockLlm } from "../config.js";
import { createMockProvider } from "./mock.js";
import { createOpenAiProvider } from "./openai.js";
import type { LlmProvider } from "./provider.js";

export const createProvider = (): LlmProvider =>
  useMockLlm() ? createMockProvider() : createOpenAiProvider();

export type { LlmProvider } from "./provider.js";
