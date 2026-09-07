import type { APIRoute } from "astro";
import { PAGES } from "@/lib/site";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site?.origin ?? "http://localhost:4321").replace(/\/$/, "");
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${origin}${PAGES.methodology.path}`, priority: "0.8", changefreq: "weekly" },
    { loc: `${origin}/api/models.json`, priority: "0.6", changefreq: "daily" },
    { loc: `${origin}/llms.txt`, priority: "0.4", changefreq: "monthly" },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
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
