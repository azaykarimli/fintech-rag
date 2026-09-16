// Pure functions: parse a markdown file with front-matter into a SourceDoc, then split it
// into overlapping chunks. No I/O here, which makes these trivially unit-testable.

import { createHash } from "node:crypto";
import { err, ok, type Chunk, type Result, type SourceDoc } from "../types.js";

export const parseDoc = (raw: string): Result<SourceDoc> => {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return err("missing front-matter");
  const meta = Object.fromEntries(
    m[1]!.split("\n").map((line) => {
      const [k, ...rest] = line.split(":");
      return [k!.trim(), rest.join(":").trim()];
    }),
  );
  const id = meta["id"], title = meta["title"], tenant = meta["tenant"], rolesRaw = meta["roles"];
  if (!id || !title || !tenant || !rolesRaw) return err("front-matter needs id, title, tenant, roles");
  const roles = rolesRaw.replace(/[[\]]/g, "").split(",").map((r) => r.trim()).filter(Boolean);
  return ok({ id, title, tenant, roles, body: m[2]!.trim() });
};

/**
 * Split on paragraph boundaries first, then pack paragraphs into windows of ~size chars
 * with `overlap` chars carried into the next window so a fact on a boundary is not lost.
 * Chunking strategy is one of the first things you tune against the evals.
 */
export const chunkDoc = (doc: SourceDoc, size: number, overlap: number): Chunk[] => {
  const paragraphs = doc.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const windows: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (current.length + p.length + 2 > size && current) {
      windows.push(current);
      current = current.slice(-overlap) + "\n\n" + p; // carry the tail forward
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current) windows.push(current);

  return windows.map((text, index) => {
    // Prefixing the title gives the embedding document-level context for free.
    const contextual = `${doc.title}\n\n${text}`;
    return {
      id: `${doc.id}#${index}`,
      docId: doc.id,
      title: doc.title,
      tenant: doc.tenant,
      roles: doc.roles,
      index,
      text: contextual,
      contentHash: createHash("sha256").update(contextual).digest("hex"),
    };
  });
};
