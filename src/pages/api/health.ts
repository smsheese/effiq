import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { matrixAgeMs, isSyncLocked } from "@/lib/matrix";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const age = await matrixAgeMs();
    const locked = await isSyncLocked();
    let manifest: unknown = null;
    try {
      const raw = await readFile(path.join(process.cwd(), "data", "sync-manifest.json"), "utf8");
      manifest = JSON.parse(raw);
    } catch {
      manifest = null;
    }
    const stale = age == null || age > 36 * 60 * 60 * 1000;
    return new Response(
      JSON.stringify({
        status: stale ? "stale" : "ok",
        cacheAgeSeconds: age != null ? Math.round(age / 1000) : null,
        cacheStale: stale,
        syncLocked: locked,
        manifest,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
