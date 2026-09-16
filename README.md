# fintech-rag

A small, production-shaped Retrieval-Augmented Generation (RAG) service in TypeScript, built
around a domain I know well: SEPA Direct Debit operations. It is deliberately minimal so every
design decision is visible, but it has the parts that matter when an LLM touches financial data:

- **Event-shaped ingestion** — documents are parsed, chunked, embedded in batches and upserted
  *idempotently* (a content hash makes re-ingestion a no-op). Swapping the directory walk for a
  Kafka consumer changes one function.
- **Permission-filtered hybrid retrieval** — vector similarity (pgvector, HNSW) + Postgres
  full-text search, fused with Reciprocal Rank Fusion. The tenant/role filter is inside the
  SQL `WHERE`, so a chunk the caller may not see never reaches the model.
- **Guardrails** — input: length limits, prompt-injection heuristics, PII redaction (IBAN,
  e-mail, card, codice fiscale) *before* anything is sent to the model or logged. Output: strict
  Zod schema, citations must point to retrieved chunks, ungrounded answers become refusals.
- **Evals** — a golden set covering retrieval hits, answer content, refusals, access control,
  injection and PII. Deterministic, runs offline, fails CI under 90%.
- **Observability** — latency, tokens and estimated cost per request; logs carry metrics and
  identifiers only, never question or answer text.
- **Swappable providers** — an `LlmProvider` interface with an OpenAI implementation and a
  deterministic mock; a `VectorStore` interface with Postgres/pgvector and in-memory
  implementations. Everything runs with **no API key and no database** for tests.

## Run it

```bash
npm install
cp .env.example .env          # leave both keys empty for the fully offline mode

npm run eval                  # golden-set evaluation
npm run ask -- "Which return code do we retry automatically?"
npm run ask -- "At which risk score do we hold a collection?" --tenant internal --roles risk
npm run ask -- "At which risk score do we hold a collection?" --roles support   # -> refused
npm run serve                 # POST /ask {"question": "..."} with x-user-tenant / x-user-roles headers
```

With a real model: set `OPENAI_API_KEY` in `.env`. With Postgres + pgvector:

```bash
docker compose up -d
echo 'DATABASE_URL=postgres://rag:rag@localhost:5433/rag' >> .env
npm run ingest                # run it twice: second run reports inserted=0 skipped=N
npm run eval
```

## Layout

```
src/
  types.ts              Result type, Principal, Chunk, Answer, Metrics
  config.ts             env + the knobs you tune against the evals (chunk size, top-k, ...)
  llm/                  LlmProvider interface, OpenAI impl, deterministic mock
  store/                VectorStore interface, Postgres/pgvector impl, in-memory impl, RRF
  ingest/               pure chunking + batch ingestion
  guardrails/           input (injection, PII) and output (schema, citations, groundedness)
  answer.ts             the pipeline: guard -> retrieve -> prompt -> model -> guard -> metrics
  evals/                golden.json + runner
  cli.ts, server.ts     entry points
data/docs/              sample documents with tenant/roles front-matter
```

## Design notes

**Why the access filter lives in the store.** Filtering after retrieval is the classic RAG
data-leak: the model already saw the chunk, and top-k is now silently smaller. The filter is
part of the query, and the eval suite has a case (`risk-threshold-unauthorised`) that fails if
it ever regresses.

**Why the model's output is treated as untrusted input.** The same rule I apply to a risk
score in a payment pipeline: a score (or an LLM answer) is advisory. It must pass a schema, its
citations must exist, and it must never trigger a financial side effect on its own without a
deterministic rule or a human approval on top.

**Why hybrid search.** Fintech questions are full of exact tokens — `AC04`, `MD06`, IBAN
prefixes, amounts — that embeddings handle poorly and full-text search handles perfectly. RRF
merges the two rankings without calibrating their scores.

**Why a mock provider.** Evals must run on every commit. A deterministic provider makes the
pipeline testable in CI for free; the real model is then evaluated on a schedule, not on every
push.

**Cost/latency knobs.** Embedding batching at ingestion; `topK` and `chunkSizeChars` bound the
prompt size (and therefore cost and latency); `temperature: 0` for reproducible evals; the
cheapest model that passes the eval suite is the right model.

## What I would add next

Row-level security policies in Postgres instead of a `WHERE` clause; a reranker between
retrieval and generation; an LLM-as-judge eval layer with its own calibration set; semantic
caching of frequent questions; a Kafka consumer for `documents.updated`; OpenTelemetry traces.
