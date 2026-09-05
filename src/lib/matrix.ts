import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import type { ModelsMatrix } from "./schema";

function matrixPath(): string {
  return process.env.MATRIX_FILE ?? path.join(process.cwd(), "data", "models-matrix.json");
}

function lockPath(): string {
  return process.env.SYNC_LOCK_FILE ?? path.join(process.cwd(), "data", ".sync.lock");
}

export async function readMatrix(): Promise<ModelsMatrix> {
  const file = await readFile(matrixPath(), "utf8");
  return JSON.parse(file) as ModelsMatrix;
}

export async function matrixAgeMs(): Promise<number | null> {
  try {
    const info = await stat(matrixPath());
    return Date.now() - info.mtimeMs;
  } catch {
    return null;
  }
}

export async function isSyncLocked(): Promise<boolean> {
  try {
    const raw = await readFile(lockPath(), "utf8");
    const ts = Number(raw || 0);
    return Number.isFinite(ts) && Date.now() - ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Legacy OpenRouter cache helpers kept for health compatibility. */
export const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getModelsData(): Promise<{ fetchedAt: string; data: unknown }> {
  const matrix = await readMatrix();
  return { fetchedAt: matrix.generatedAt, data: matrix };
}

export async function cacheAgeMs(): Promise<number | null> {
  return matrixAgeMs();
}
