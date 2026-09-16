// Offline evaluation suite. Three cheap, deterministic checks per case:
//   1. retrieval hit   — is the expected document among the retrieved chunks?
//   2. answer check    — does the answer contain the expected keywords (or refuse when it must)?
//   3. guardrail check — were injection / PII / access-control cases handled?
// Run it on every change to chunking, prompts, top-k or model. Fails CI below the threshold.
// (An LLM-as-judge score for answer quality would be the next layer; deliberately left out
// here because it costs money and needs its own calibration.)

import { readFile } from "node:fs/promises";
import { answerQuestion, retrieve, type Deps } from "../answer.js";
import { guardInput } from "../guardrails/input.js";
import type { Principal } from "../types.js";

interface GoldenCase {
  id: string;
  principal: Principal;
  question: string;
  expectDocId: string | null;
  expectKeywords: string[];
  expectRefusal: boolean;
  expectInputRejected?: boolean;
  expectRedactions?: number;
  note?: string;
}

interface CaseResult {
  id: string;
  retrievalHit: boolean | null;
  answerOk: boolean;
  guardOk: boolean;
  latencyMs: number;
  detail: string;
}

const PASS_THRESHOLD = 0.9;

export const runEvals = async (deps: Deps, goldenPath: string): Promise<{ passRate: number; results: CaseResult[] }> => {
  const cases = JSON.parse(await readFile(goldenPath, "utf8")) as GoldenCase[];
  const results: CaseResult[] = [];

  for (const c of cases) {
    const t0 = performance.now();

    // Guardrail expectations that are decided before the model runs.
    const input = guardInput(c.question);
    if (c.expectInputRejected) {
      const guardOk = !input.ok;
      results.push({ id: c.id, retrievalHit: null, answerOk: guardOk, guardOk, latencyMs: 0, detail: input.ok ? "expected input rejection" : input.error });
      continue;
    }
    let guardOk = input.ok;
    if (input.ok && c.expectRedactions !== undefined) guardOk &&= input.value.redactions === c.expectRedactions;

    // Retrieval check (independent of the model, so you can tune chunking/top-k in isolation).
    let retrievalHit: boolean | null = null;
    if (input.ok) {
      const hits = await retrieve(input.value.question, c.principal, deps);
      const docIds = new Set(hits.map((h) => h.docId));
      if (c.expectDocId !== null) {
        retrievalHit = docIds.has(c.expectDocId);
      } else if (!c.principal.roles.includes("risk")) {
        // Access-control invariant: a non-risk principal must never retrieve the internal doc.
        retrievalHit = !docIds.has("risk-scoring");
      }
    }

    // End-to-end answer check.
    const res = await answerQuestion(c.question, c.principal, deps);
    let answerOk = false;
    let detail = "";
    if (!res.ok) {
      detail = res.error;
    } else {
      const a = res.value;
      const keywordsOk = c.expectKeywords.every((k) => a.answer.toLowerCase().includes(k.toLowerCase()));
      answerOk = c.expectRefusal ? a.refused : !a.refused && keywordsOk;
      detail = (a.refused ? "(refused) " : "") + a.answer.replace(/\s+/g, " ").slice(0, 90);
    }

    results.push({ id: c.id, retrievalHit, answerOk, guardOk, latencyMs: Math.round(performance.now() - t0), detail });
  }

  const passed = results.filter((r) => r.answerOk && r.guardOk && r.retrievalHit !== false).length;
  return { passRate: passed / results.length, results };
};

export const printReport = (r: { passRate: number; results: CaseResult[] }): void => {
  const mark = (b: boolean | null) => (b === null ? " - " : b ? "ok " : "FAIL");
  console.log("\ncase                          retr  answ  guard  ms   detail");
  for (const x of r.results) {
    console.log(`${x.id.padEnd(30)}${mark(x.retrievalHit)}  ${mark(x.answerOk)}  ${mark(x.guardOk)}   ${String(x.latencyMs).padStart(4)} ${x.detail}`);
  }
  console.log(`\npass rate: ${(r.passRate * 100).toFixed(0)}%  (threshold ${PASS_THRESHOLD * 100}%)`);
  if (r.passRate < PASS_THRESHOLD) process.exitCode = 1;
};
