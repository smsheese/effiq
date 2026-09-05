import type { APIRoute } from "astro";
import { readMatrix, matrixAgeMs } from "@/lib/matrix";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const matrix = await readMatrix();
    const age = await matrixAgeMs();
    const body = JSON.stringify(matrix);
    const etag = `"${matrix.generatedAt}-${matrix.variants.length}"`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        ETag: etag,
        "X-Matrix-Age-Seconds": age != null ? String(Math.round(age / 1000)) : "",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
