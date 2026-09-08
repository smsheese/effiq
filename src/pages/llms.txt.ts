import type { APIRoute } from "astro";
import { MATRIX_CSV_URL, MATRIX_JSON_URL, absoluteMatrixUrl } from "@/lib/data-url";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.origin ?? "http://localhost:4321").replace(/\/$/, "");
  const matrixJson = absoluteMatrixUrl(origin, MATRIX_JSON_URL);
  const matrixCsv = absoluteMatrixUrl(origin, MATRIX_CSV_URL);
  const body = `# effiq
> effiq ranks LLM reasoning variants by capability per measured or estimated task dollar.

effiq is a static public site. It scores OpenRouter, Cursor, and OpenCode Go model variants with Artificial Analysis indexes and provider prices. Measured task costs stay labeled apart from workload estimates. Approximations stay labeled.

## Pages
- Home / explorer: ${origin}/
- About + scoring guide: ${origin}/about/ (project background and the full methodology: defaults, sources, Effiq Score, profiles, estimation ladder, freshness)
- Coding subscriptions by budget: ${origin}/subscriptions/ (plan advisor: consumption fit, smartest-model intelligence, task-size and rhythm controls)
- Models matrix (JSON): ${matrixJson}
- Models matrix (CSV): ${matrixCsv}
- Health / data freshness: ${origin}/api/health
- Sitemap: ${origin}/sitemap.xml
- Robots: ${origin}/robots.txt

## Sources
- Primary evidence: Artificial Analysis, OpenRouter, Cursor published pricing, OpenCode Go published pricing (https://opencode.ai/docs/go/), Claude/ChatGPT/Cursor subscription list prices with official, community, and derived consumption caps

## Notes
- The home page ships a server-rendered top-10 ranking snapshot with the matrix date in the initial HTML; the full explorer recomputes in the browser after it fetches the public matrix
- The default intelligence floor is 40. Visitors can change metric weights
- The EQ (Effiq) Score is not fixed: it changes with visitor requirements (profile, weights, floors, filters)
- Artificial Analysis measured task cost is the primary cost evidence
- The matrix refreshes daily at 04:00 UTC and is served from a public S3-compatible bucket; the explorer fetches it live, so data updates need no redeploy
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
