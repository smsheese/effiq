import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export const API_URL = "https://openrouter.ai/api/frontend/v1/models/find?order=most-popular";

/** How long a cached snapshot is considered fresh. */
export const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

/** Default location of the cache file, overridable via the CACHE_FILE env var. */
function cacheFilePath(): string {
  return process.env.CACHE_FILE ?? path.join(process.cwd(), "data", "models-cache.json");
}

export interface CacheRecord {
  /** ISO 8601 timestamp of when the data was fetched. */
  fetchedAt: string;
  /** Raw `data` payload from the OpenRouter response. */
  data: unknown;
}

async function readCache(): Promise<CacheRecord | null> {
  try {
    const file = await readFile(cacheFilePath(), "utf8");
    const parsed = JSON.parse(file) as CacheRecord;
    if (!parsed || typeof parsed.fetchedAt !== "string" || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(record: CacheRecord): Promise<void> {
  const file = cacheFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record), "utf8");
}

async function fetchFromOpenRouter(): Promise<unknown> {
  const res = await fetch(API_URL, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("OpenRouter responded with HTTP " + res.status);
  const json = (await res.json()) as { data?: unknown };
  if (json.data == null) throw new Error("Unexpected OpenRouter response shape");
  return json.data;
}

/** Cache file's mtime, so callers can report staleness. */
export async function cacheAgeMs(): Promise<number | null> {
  try {
    const info = await stat(cacheFilePath());
    return Date.now() - info.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Return cached model data if it is fresh (< 60 min old), otherwise fetch a
 * fresh snapshot from OpenRouter, persist it, and return it. This keeps the
 * browser away from the OpenRouter API entirely; the site only ever calls it
 * at most once per hour.
 */
export async function getModelsData(): Promise<CacheRecord> {
  const cached = await readCache();
  if (cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age >= 0 && age < CACHE_TTL_MS) return cached;
  }

  const data = await fetchFromOpenRouter();
  const record: CacheRecord = { fetchedAt: new Date().toISOString(), data };
  await writeCache(record);
  return record;
}