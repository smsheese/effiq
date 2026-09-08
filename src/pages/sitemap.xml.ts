import type { APIRoute } from "astro";
import { PAGES } from "@/lib/site";
import { loadMatrix } from "@/lib/topPicks";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.origin ?? "http://localhost:4321").replace(/\/$/, "");
  // lastmod comes from the matrix build, not wall-clock build time, so
  // identical daily timestamps do not appear when nothing changed.
  const lastmod = new Date(loadMatrix().generatedAt).toISOString().slice(0, 10);
  const urls = [
    { loc: `${origin}/` },
    { loc: `${origin}${PAGES.about.path}` },
    { loc: `${origin}${PAGES.subscriptions.path}` },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
