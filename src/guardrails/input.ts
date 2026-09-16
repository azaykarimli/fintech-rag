// Input guardrails: run BEFORE anything reaches the model or the logs.
// All pure functions returning Result so the pipeline can short-circuit.

import { err, ok, type Result } from "../types.js";

const MAX_QUESTION_CHARS = 1000;

/** Patterns that indicate an attempt to override the system prompt. Heuristic, not a
 *  silver bullet — in production you'd add a small classifier and log every hit. */
const INJECTION_PATTERNS = [
  /ignore (all|any|the|previous|prior|above) (instructions|rules|prompts?)/i,
  /you are now\b/i,
  /reveal (your|the) (system|hidden) prompt/i,
  /\bDAN\b/,
  /disregard (the )?(system|previous)/i,
];

/** Redact data that must never be sent to a third-party model or persisted in logs. */
export const redactPii = (text: string): { text: string; redactions: number } => {
  let n = 0;
  const redacted = text
    // IBAN: 2 letters, 2 digits, 11–30 alphanumerics
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, () => (n++, "[IBAN]"))
    // Email
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, () => (n++, "[EMAIL]"))
    // Card-like 13–19 digit sequences with optional spaces
    .replace(/\b(?:\d[ -]?){13,19}\b/g, () => (n++, "[CARD]"))
    // Italian codice fiscale
    .replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g, () => (n++, "[CF]"));
  return { text: redacted, redactions: n };
};

export interface CleanQuestion {
  readonly question: string;
  readonly redactions: number;
}

export const guardInput = (raw: string): Result<CleanQuestion> => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return err("empty question");
  if (trimmed.length > MAX_QUESTION_CHARS) return err(`question longer than ${MAX_QUESTION_CHARS} chars`);
  if (INJECTION_PATTERNS.some((p) => p.test(trimmed))) return err("possible prompt injection");
  const { text, redactions } = redactPii(trimmed);
  return ok({ question: text, redactions });
};
