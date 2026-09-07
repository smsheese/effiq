import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.origin ?? "http://localhost:4321").replace(/\/$/, "");
  const body = `# effiq
> effiq ranks LLM reasoning variants by capability per measured or estimated task dollar.

effiq is a static public site. It scores OpenRouter, Cursor, and OpenCode Go model variants with Artificial Analysis indexes and provider prices. Measured task costs stay labeled apart from workload estimates. Approximations stay labeled.

## Pages
- Home / explorer: ${origin}/
- Methodology: ${origin}/methodology/
- Models matrix (JSON): ${origin}/api/models.json
- Models matrix (CSV): ${origin}/api/models.csv
- Health / data freshness: ${origin}/api/health
- Sitemap: ${origin}/sitemap.xml
- Robots: ${origin}/robots.txt

## Sources
- Primary evidence: Artificial Analysis, OpenRouter, Cursor published pricing, OpenCode Go published pricing (https://opencode.ai/docs/go/)

## Notes
- The site ranks variants in the browser after it fetches the public matrix
- The default intelligence floor is 40. Visitors can change metric weights
- Artificial Analysis measured task cost is the primary cost evidence
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
