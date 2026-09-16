// Usage:
//   npm run ingest
//   npm run ask -- "Which return code do we retry?" [--tenant public] [--roles support,ops]
//   npm run eval

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerQuestion } from "./answer.js";
import { config, useMemoryStore } from "./config.js";
import { printReport, runEvals } from "./evals/run.js";
import { ingestDocs, loadDocsFromDir } from "./ingest/ingest.js";
import { createProvider } from "./llm/index.js";
import { createStore } from "./store/index.js";
import type { Principal } from "./types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(root, "data", "docs");
const GOLDEN = join(root, "src", "evals", "golden.json");

const flag = (args: string[], name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const main = async (): Promise<void> => {
  const [cmd, ...args] = process.argv.slice(2);
  const llm = createProvider();
  const [probe] = await llm.embed(["dimension probe"]);
  const store = createStore(probe!.length);
  await store.init();
  console.log(`llm=${llm.name} model=${config.chatModel} store=${store.name}`);

  // The in-memory store starts empty on every process, so ingest on the fly for ask/eval.
  const ensureIngested = async () => {
    if (useMemoryStore() || cmd === "ingest") {
      const r = await ingestDocs(await loadDocsFromDir(DOCS_DIR), llm, store);
      console.log(`ingested docs=${r.docs} chunks=${r.chunks} inserted=${r.inserted} skipped=${r.skipped}`);
    }
  };

  try {
    switch (cmd) {
      case "ingest":
        await ensureIngested();
        break;

      case "ask": {
        await ensureIngested();
        // First positional argument that is not a flag or a flag's value.
        const question = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--")) ?? "";
        const principal: Principal = {
          userId: "cli",
          tenant: flag(args, "tenant", "public"),
          roles: flag(args, "roles", "support").split(","),
        };
        const res = await answerQuestion(question, principal, { llm, store });
        console.log(JSON.stringify(res, null, 2));
        break;
      }

      case "eval": {
        await ensureIngested();
        printReport(await runEvals({ llm, store }, GOLDEN));
        break;
      }

      default:
        console.log("commands: ingest | ask <question> [--tenant t] [--roles a,b] | eval");
    }
  } finally {
    await store.close();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
