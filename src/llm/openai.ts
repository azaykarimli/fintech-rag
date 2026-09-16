import OpenAI from "openai";
import { config } from "../config.js";
import type { ChatMessage, ChatResult, LlmProvider } from "./provider.js";

export const createOpenAiProvider = (): LlmProvider => {
  const client = new OpenAI({ apiKey: config.openaiApiKey });

  return {
    name: "openai",

    async embed(texts) {
      // The embeddings endpoint accepts a batch; batching is the single biggest cost/latency
      // win at ingestion time.
      const res = await client.embeddings.create({
        model: config.embeddingModel,
        input: [...texts],
      });
      return res.data.map((d) => d.embedding);
    },

    async chatJson(messages: readonly ChatMessage[]): Promise<ChatResult> {
      const res = await client.chat.completions.create({
        model: config.chatModel,
        temperature: 0, // deterministic-ish answers make evals meaningful
        response_format: { type: "json_object" },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const choice = res.choices[0];
      return {
        text: choice?.message.content ?? "",
        promptTokens: res.usage?.prompt_tokens ?? 0,
        completionTokens: res.usage?.completion_tokens ?? 0,
        model: res.model,
      };
    },
  };
};
