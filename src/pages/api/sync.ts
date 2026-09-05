import type { APIRoute } from "astro";
import { spawn } from "node:child_process";
import path from "node:path";
import { isSyncLocked } from "@/lib/matrix";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const token = process.env.SYNC_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "SYNC_TOKEN not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const auth = request.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-sync-token");
  if (provided !== token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (await isSyncLocked()) {
    return new Response(JSON.stringify({ error: "Sync already running" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const script = path.join(process.cwd(), "scripts", "sync.ts");
  const child = spawn("npx", ["tsx", script], {
    cwd: process.cwd(),
    env: { ...process.env, OPENROUTER_REFRESH: "1" },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return new Response(JSON.stringify({ ok: true, message: "Sync started", pid: child.pid }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
};
