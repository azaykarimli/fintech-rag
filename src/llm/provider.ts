// A thin provider interface. The rest of the app never imports the OpenAI SDK directly,
// so switching models/vendors (or running offline in tests) is a one-line change.

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ChatResult {
  readonly text: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string;
}

export interface LlmProvider {
  readonly name: string;
  embed(texts: readonly string[]): Promise<number[][]>;
  /** Ask for a JSON object; the caller validates it with a schema. */
  chatJson(messages: readonly ChatMessage[]): Promise<ChatResult>;
}
