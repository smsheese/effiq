#!/usr/bin/env node
/**
 * Fetch / load sources, merge into models-matrix.json + .csv, write manifest.
 *
 * Usage: npm run sync
 * Env:
 *   AA_CATALOG_PATH, CURSOR_MODELS_CSV, OPENROUTER_CACHE, OUT_DIR
 *   ARTIFICIAL_ANALYSIS_API_KEY (optional live refresh)
 *   OPENROUTER_REFRESH=1 to force OpenRouter fetch
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMatrix, matrixToCsv } from "../src/lib/merge.ts";
import type { ModelsMatrix, SyncManifest } from "../src/lib/schema.ts";
import { adaptArtificialAnalysis } from "../src/lib/sources/artificial-analysis.ts";
import { adaptCursor, parseCsv } from "../src/lib/sources/cursor.ts";
import { adaptOpenRouter, type OpenRouterCatalog } from "../src/lib/sources/openrouter.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const OUT_DIR = process.env.OUT_DIR ?? path.join(ROOT, "data");
const SNAPSHOT_DIR = path.join(OUT_DIR, "snapshots");
const LOCK_FILE = path.join(OUT_DIR, ".sync.lock");

const AA_CANDIDATES = [
  process.env.AA_CATALOG_PATH,
  path.join(OUT_DIR, "aa-catalog.json"),
  path.join(OUT_DIR, "sources", "aa-catalog.json"),
  "/home/sheese/system/data/artificial-analysis/catalog.json",
];

const CURSOR_CANDIDATES = [
  process.env.CURSOR_MODELS_CSV,
  path.join(OUT_DIR, "cursor-models.csv"),
  path.join(OUT_DIR, "sources", "cursor-models.csv"),
  "/home/sheese/system/cursor-models.csv",
];

const OR_CACHE_DEFAULT = path.join(OUT_DIR, "models-cache.json");

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveFirstExisting(candidates: (string | undefined)[]): Promise<string | null> {
  for (const c of candidates) {
    if (c && (await exists(c))) return c;
  }
  return null;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (await exists(LOCK_FILE)) {
    const raw = await readFile(LOCK_FILE, "utf8");
    const age = Date.now() - Number(raw || 0);
    if (age < 10 * 60 * 1000) throw new Error("Sync already running (lock present)");
  }
  await writeFile(LOCK_FILE, String(Date.now()), "utf8");
  try {
    return await fn();
  } finally {
    try {
      await writeFile(LOCK_FILE, "", "utf8");
      const { unlink } = await import("node:fs/promises");
      await unlink(LOCK_FILE).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
}

async function loadAa(): Promise<{
  records: Parameters<typeof adaptArtificialAnalysis>[0];
  pulledAt: string;
  version?: string | number;
  status: SyncManifest["sources"][0];
}> {
  const local = await resolveFirstExisting(AA_CANDIDATES);
  if (local) {
    const raw = JSON.parse(await readFile(local, "utf8")) as {
      meta?: { intelligence_index_version?: number };
      data: Parameters<typeof adaptArtificialAnalysis>[0];
    };
    const pulledAt = new Date().toISOString();
    return {
      records: raw.data,
      pulledAt,
      version: raw.meta?.intelligence_index_version,
      status: {
        id: "artificial_analysis",
        status: "ok",
        pulledAt,
        rowCount: raw.data.length,
      },
    };
  }
  return {
    records: [],
    pulledAt: new Date().toISOString(),
    status: {
      id: "artificial_analysis",
      status: "error",
      pulledAt: null,
      rowCount: 0,
      error: `Missing AA catalog (checked: ${AA_CANDIDATES.filter(Boolean).join(", ")})`,
    },
  };
}

async function loadCursor(): Promise<{
  rows: ReturnType<typeof parseCsv>;
  status: SyncManifest["sources"][0];
}> {
  const local = await resolveFirstExisting(CURSOR_CANDIDATES);
  if (!local) {
    return {
      rows: [],
      status: {
        id: "cursor",
        status: "error",
        pulledAt: null,
        rowCount: 0,
        error: `Missing Cursor CSV (checked: ${CURSOR_CANDIDATES.filter(Boolean).join(", ")})`,
      },
    };
  }
  const text = await readFile(local, "utf8");
  const rows = parseCsv(text);
  return {
    rows,
    status: {
      id: "cursor",
      status: "ok",
      pulledAt: new Date().toISOString(),
      rowCount: rows.length,
    },
  };
}

async function loadOpenRouter(): Promise<{
  data: OpenRouterCatalog | null;
  status: SyncManifest["sources"][0];
}> {
  const cachePath = process.env.OPENROUTER_CACHE ?? OR_CACHE_DEFAULT;
  const refresh = process.env.OPENROUTER_REFRESH === "1";

  if (refresh || !(await exists(cachePath))) {
    try {
      const url = "https://openrouter.ai/api/frontend/v1/models/find?order=most-popular";
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: OpenRouterCatalog };
      const record = { fetchedAt: new Date().toISOString(), data: json.data };
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify(record), "utf8");
      return {
        data: json.data,
        status: {
          id: "openrouter",
          status: "ok",
          pulledAt: record.fetchedAt,
          rowCount: json.data.models?.length ?? 0,
        },
      };
    } catch (err) {
      if (await exists(cachePath)) {
        const cached = JSON.parse(await readFile(cachePath, "utf8")) as {
          fetchedAt: string;
          data: OpenRouterCatalog;
        };
        return {
          data: cached.data,
          status: {
            id: "openrouter",
            status: "stale",
            pulledAt: cached.fetchedAt,
            rowCount: cached.data.models?.length ?? 0,
            error: (err as Error).message,
          },
        };
      }
      return {
        data: null,
        status: {
          id: "openrouter",
          status: "error",
          pulledAt: null,
          rowCount: 0,
          error: (err as Error).message,
        },
      };
    }
  }

  const cached = JSON.parse(await readFile(cachePath, "utf8")) as {
    fetchedAt: string;
    data: OpenRouterCatalog;
  };
  return {
    data: cached.data,
    status: {
      id: "openrouter",
      status: "ok",
      pulledAt: cached.fetchedAt,
      rowCount: cached.data.models?.length ?? 0,
    },
  };
}

async function main() {
  await withLock(async () => {
    await mkdir(OUT_DIR, { recursive: true });
    await mkdir(SNAPSHOT_DIR, { recursive: true });

    const aa = await loadAa();
    const cursor = await loadCursor();
    const or = await loadOpenRouter();

    const observedAt = new Date().toISOString();
    const aaVariants = adaptArtificialAnalysis(aa.records, aa.pulledAt, aa.version);
    const cursorVariants = adaptCursor(cursor.rows as never, observedAt);
    const orVariants = or.data ? adaptOpenRouter(or.data, or.status.pulledAt ?? observedAt) : [];

    const prevPath = path.join(OUT_DIR, "models-matrix.json");
    let previousIds: Set<string> | undefined;
    if (await exists(prevPath)) {
      try {
        const prev = JSON.parse(await readFile(prevPath, "utf8")) as ModelsMatrix;
        previousIds = new Set(prev.variants.map((v) => v.canonicalId));
      } catch {
        previousIds = undefined;
      }
    }

    const sources: SyncManifest["sources"] = [
      aa.status,
      cursor.status,
      or.status,
      {
        id: "opencode",
        status: "skipped",
        pulledAt: null,
        rowCount: 0,
        error: "Registry URL not configured",
      },
      {
        id: "kilocode",
        status: "skipped",
        pulledAt: null,
        rowCount: 0,
        error: "Registry URL not configured",
      },
      {
        id: "whatllm",
        status: "skipped",
        pulledAt: null,
        rowCount: 0,
        error: "Guarded scraper disabled until robots/terms check passes",
      },
      {
        id: "llm_stats",
        status: "skipped",
        pulledAt: null,
        rowCount: 0,
        error: "Guarded scraper disabled until robots/terms check passes",
      },
    ];

    // AA first so measured benchmarks win merge priority ties via order
    const matrix = buildMatrix([aaVariants, orVariants, cursorVariants], sources, previousIds);

    const jsonPath = path.join(OUT_DIR, "models-matrix.json");
    const csvPath = path.join(OUT_DIR, "models-matrix.csv");
    const manifestPath = path.join(OUT_DIR, "sync-manifest.json");
    const tmpJson = jsonPath + ".tmp";
    const tmpCsv = csvPath + ".tmp";

    await writeFile(tmpJson, JSON.stringify(matrix), "utf8");
    await writeFile(tmpCsv, matrixToCsv(matrix), "utf8");
    await writeFile(manifestPath, JSON.stringify(matrix.manifest, null, 2), "utf8");
    await rename(tmpJson, jsonPath);
    await rename(tmpCsv, csvPath);

    const stamp = matrix.generatedAt.replace(/[:.]/g, "-");
    await copyFile(jsonPath, path.join(SNAPSHOT_DIR, `models-matrix-${stamp}.json`));

    const hash = createHash("sha256").update(JSON.stringify(matrix.manifest)).digest("hex").slice(0, 12);
    console.log(
      JSON.stringify(
        {
          ok: true,
          variants: matrix.manifest.variantCount ?? matrix.variants.length,
          hash,
          generatedAt: matrix.generatedAt,
          sources: matrix.manifest.sources.map((s) => ({ id: s.id, status: s.status, rows: s.rowCount })),
        },
        null,
        2,
      ),
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
