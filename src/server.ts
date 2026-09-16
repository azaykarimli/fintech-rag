// Minimal HTTP surface. POST /ask {"question": "..."}
// Identity comes from headers here for demo purposes ONLY. In production the principal is
// derived from a verified JWT / mTLS identity at the gateway and the body is never trusted.

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerQuestion } from "./answer.js";
import { config, useMemoryStore } from "./config.js";
import { ingestDocs, loadDocsFromDir } from "./ingest/ingest.js";
import { createProvider } from "./llm/index.js";
import { createStore } from "./store/index.js";
import type { Principal } from "./types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const readBody = (req: import("node:http").IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

const main = async () => {
  const llm = createProvider();
  const [probe] = await llm.embed(["dimension probe"]);
  const store = createStore(probe!.length);
  await store.init();
  if (useMemoryStore()) await ingestDocs(await loadDocsFromDir(join(root, "data", "docs")), llm, store);

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/ask") {
      res.writeHead(404).end();
      return;
    }
    const principal: Principal = {
      userId: String(req.headers["x-user-id"] ?? "anonymous"),
      tenant: String(req.headers["x-user-tenant"] ?? "public"),
      roles: String(req.headers["x-user-roles"] ?? "support").split(","),
    };
    let question = "";
    try {
      question = String((JSON.parse(await readBody(req)) as { question?: unknown }).question ?? "");
    } catch {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }
    const result = await answerQuestion(question, principal, { llm, store });
    // Structured log line: what you'd ship to your observability stack. Note: no question text,
    // no answer text — only metrics and identifiers, so logs never become a PII store.
    console.log(JSON.stringify({ userId: principal.userId, ok: result.ok, ...(result.ok ? result.value.metrics : { error: result.error }) }));
    res.writeHead(result.ok ? 200 : 422, { "content-type": "application/json" }).end(JSON.stringify(result));
  });

  server.listen(config.port, () => console.log(`listening on :${config.port} (llm=${llm.name}, store=${store.name})`));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
