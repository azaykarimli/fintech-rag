// Postgres + pgvector store. Hybrid search = vector similarity + full-text search (tsvector),
// fused with RRF. Row-level access filtering happens in the SQL WHERE clause so it is
// impossible to "forget" it in application code.

import pg from "pg";
import { config } from "../config.js";
import type { Chunk, ScoredChunk } from "../types.js";
import { rrf, type SearchQuery, type VectorStore } from "./store.js";

const toVectorLiteral = (v: readonly number[]): string => `[${v.join(",")}]`;

export const createPostgresStore = (dim: number): VectorStore => {
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  return {
    name: "postgres",

    async init() {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chunks (
          id            text PRIMARY KEY,
          doc_id        text NOT NULL,
          title         text NOT NULL,
          tenant        text NOT NULL,
          roles         text[] NOT NULL,
          idx           int  NOT NULL,
          text          text NOT NULL,
          content_hash  text NOT NULL,
          embedding     vector(${dim}) NOT NULL,
          tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
          updated_at    timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS chunks_tenant_idx ON chunks (tenant)`);
      // HNSW index for approximate nearest neighbour; fine for this size, tune ef_search in prod.
      await pool.query(`CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)`);
    },

    async upsert(chunks, embeddings) {
      let inserted = 0, skipped = 0;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]!;
          // ON CONFLICT ... WHERE content_hash differs -> idempotent re-ingestion.
          const res = await client.query(
            `INSERT INTO chunks (id, doc_id, title, tenant, roles, idx, text, content_hash, embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)
             ON CONFLICT (id) DO UPDATE
               SET title=EXCLUDED.title, tenant=EXCLUDED.tenant, roles=EXCLUDED.roles,
                   text=EXCLUDED.text, content_hash=EXCLUDED.content_hash,
                   embedding=EXCLUDED.embedding, updated_at=now()
               WHERE chunks.content_hash <> EXCLUDED.content_hash`,
            [c.id, c.docId, c.title, c.tenant, [...c.roles], c.index, c.text, c.contentHash, toVectorLiteral(embeddings[i]!)],
          );
          if (res.rowCount === 1) inserted++; else skipped++;
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return { inserted, skipped };
    },

    async search(q: SearchQuery): Promise<ScoredChunk[]> {
      const { principal } = q;
      const candidateN = q.topK * 4;

      // The access predicate is identical in both queries. In production you would put it
      // in a SQL function or a row-level-security policy so it cannot drift.
      const access = `(tenant = 'public' OR tenant = $1) AND roles && $2::text[]`;

      const [vec, fts] = await Promise.all([
        pool.query<{ id: string }>(
          `SELECT id FROM chunks WHERE ${access}
           ORDER BY embedding <=> $3::vector LIMIT $4`,
          [principal.tenant, [...principal.roles], toVectorLiteral(q.embedding), candidateN],
        ),
        pool.query<{ id: string }>(
          `SELECT id FROM chunks WHERE ${access} AND tsv @@ plainto_tsquery('english', $3)
           ORDER BY ts_rank(tsv, plainto_tsquery('english', $3)) DESC LIMIT $4`,
          [principal.tenant, [...principal.roles], q.text, candidateN],
        ),
      ]);

      const fused = rrf([vec.rows.map((r) => r.id), fts.rows.map((r) => r.id)]);
      const top = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, q.topK);
      if (top.length === 0) return [];

      const rows = await pool.query<{
        id: string; doc_id: string; title: string; tenant: string; roles: string[]; idx: number; text: string; content_hash: string;
      }>(`SELECT id, doc_id, title, tenant, roles, idx, text, content_hash FROM chunks WHERE id = ANY($1)`, [top.map(([id]) => id)]);

      const byId = new Map(rows.rows.map((r) => [r.id, r]));
      return top.flatMap(([id, score]) => {
        const r = byId.get(id);
        if (!r) return [];
        const chunk: ScoredChunk = {
          id: r.id, docId: r.doc_id, title: r.title, tenant: r.tenant, roles: r.roles,
          index: r.idx, text: r.text, contentHash: r.content_hash, score,
        };
        return [chunk];
      });
    },

    async close() {
      await pool.end();
    },
  };
};

export type { Chunk };
