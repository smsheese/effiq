import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const prerender = true;

export const GET: APIRoute = async () => {
  try {
    const csv = await readFile(path.join(process.cwd(), "data", "models-matrix.csv"), "utf8");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="models-matrix.csv"',
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
