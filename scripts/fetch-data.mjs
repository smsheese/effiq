#!/usr/bin/env node
/**
 * Pull the current matrix files from the public S3/R2 bucket into data/.
 *
 * Reads PUBLIC_MATRIX_URL (full URL to models-matrix.json on the bucket),
 * derives the other file URLs from it, and writes the downloads into data/
 * atomically (tmp + rename). Individual failures keep the local copy; a
 * missing PUBLIC_MATRIX_URL is a no-op so local dev can rely on `npm run sync`
 * output instead.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.OUT_DIR ?? path.join(ROOT, "data");

const FILES = [
  { name: "models-matrix.json", type: "application/json" },
  { name: "models-matrix.csv", type: "text/csv" },
  { name: "sync-manifest.json", type: "application/json" },
];

const jsonUrl = process.env.PUBLIC_MATRIX_URL;
if (!jsonUrl) {
  console.log("[data:pull] PUBLIC_MATRIX_URL not set; keeping local data files");
  process.exit(0);
}
const base = jsonUrl.replace(/models-matrix\.json$/, "");
if (base === jsonUrl) {
  console.error("[data:pull] PUBLIC_MATRIX_URL must point at models-matrix.json");
  process.exit(1);
}

let criticalFailure = false;
for (const file of FILES) {
  const url = base + file.name;
  try {
    const res = await fetch(url, { headers: { Accept: file.type } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (file.name === "models-matrix.json") {
      const parsed = JSON.parse(body.toString("utf8"));
      if (!(Array.isArray(parsed.variants) && parsed.variants.length > 0)) {
        throw new Error("matrix payload has no variants");
      }
    }
    await mkdir(DATA_DIR, { recursive: true });
    const target = path.join(DATA_DIR, file.name);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, target);
    console.log(`[data:pull] ${url} -> ${path.relative(ROOT, target)} (${body.length} bytes)`);
  } catch (err) {
    if (file.name === "models-matrix.json") criticalFailure = true;
    console.warn(`[data:pull] ${file.name}: ${err.message}; keeping local copy`);
  }
}

if (criticalFailure) {
  console.error("[data:pull] failed to download models-matrix.json from the bucket");
  process.exit(1);
}
