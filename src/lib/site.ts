/** Site URL helpers for metadata, discovery files, and build validation. */

const EXAMPLE_HOST_RE = /(^|\.)example\.(com|org|net)$/i;
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

export type SitePageId = "home" | "about" | "subscriptions" | "notFound";

export interface SitePageMeta {
  id: SitePageId;
  path: string;
  title: string;
  description: string;
  ogImage: string;
  heading: string;
}

export const SITE_NAME = "effiq";
export const SITE_TAGLINE = "efficiency × iq";

export const PAGES: Record<SitePageId, SitePageMeta> = {
  home: {
    id: "home",
    path: "/",
    title:
      "LLM cost comparison — cheapest AI models per task dollar | effiq",
    description:
      "Compare LLM costs per task. effiq ranks reasoning variants by capability per measured or estimated task dollar across OpenRouter, Cursor, OpenCode Go, and Artificial Analysis benchmarks.",
    ogImage: "/og.png",
    heading: "LLM cost comparison, ranked per task dollar",
  },
  about: {
    id: "about",
    path: "/about/",
    title: "About & scoring guide — who builds effiq and how ranking works",
    description:
      "Who builds effiq, why it ranks capability per task dollar, and the full scoring guide: defaults, sources, Effiq Score computation, usage profiles, estimation ladder, and data freshness.",
    ogImage: "/og.png",
    heading: "About effiq",
  },
  subscriptions: {
    id: "subscriptions",
    path: "/subscriptions/",
    title: "Best coding subscription plans by budget — Claude vs ChatGPT vs Cursor | effiq",
    description:
      "Advisor for Claude, ChatGPT, Cursor, OpenRouter, and OpenCode Go coding spend: included consumption in each plan's own unit, smartest-model intelligence, task-size and rhythm controls, and fit verdicts per budget.",
    ogImage: "/og.png",
    heading: "Coding subscriptions, compared per budget",
  },
  notFound: {
    id: "notFound",
    path: "/404/",
    title: "Page not found — effiq",
    description: "This URL is not a page on effiq. The model explorer and the about page remain available.",
    ogImage: "/og.png",
    heading: "Page not found",
  },
};

export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("SITE_URL is empty");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`SITE_URL must use http or https: ${raw}`);
  }
  // Canonical site roots always end with a single trailing slash for Astro.site.
  const path = url.pathname.replace(/\/+$/, "") || "";
  return `${url.origin}${path}/`;
}

export function assertProductionSiteUrl(raw: string | undefined): string {
  if (!raw || !raw.trim()) {
    throw new Error(
      "SITE_URL is required for production builds. Set it to your public HTTPS origin (for example https://your-domain.example).",
    );
  }
  const site = normalizeSiteUrl(raw);
  const host = new URL(site).hostname;
  if (EXAMPLE_HOST_RE.test(host)) {
    throw new Error(
      `SITE_URL must not use a placeholder example domain (got ${host}). Set your real production domain.`,
    );
  }
  if (LOCAL_HOST_RE.test(host) && process.env.ALLOW_LOCAL_SITE_URL !== "1") {
    throw new Error(
      `SITE_URL must be a public production origin for builds (got ${host}). For local preview builds set ALLOW_LOCAL_SITE_URL=1.`,
    );
  }
  return site;
}

export function resolveSiteUrl(options: {
  siteUrl?: string;
  isBuild: boolean;
  allowLocal?: boolean;
}): string {
  const raw =
    options.siteUrl?.trim() ||
    (!options.isBuild ? "http://localhost:4321" : undefined);
  if (options.isBuild) {
    if (options.allowLocal) {
      process.env.ALLOW_LOCAL_SITE_URL = "1";
    }
    return assertProductionSiteUrl(raw);
  }
  return normalizeSiteUrl(raw ?? "http://localhost:4321");
}

export function absoluteUrl(site: string | URL, path: string): string {
  const base = typeof site === "string" ? site : site.href;
  return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).href;
}

export function canonicalFromAstroUrl(site: string | URL, pageUrl: URL): string {
  const origin = typeof site === "string" ? new URL(site).origin : site.origin;
  let pathname = pageUrl.pathname;
  // Normalize index and trailing slash for public HTML pages.
  if (pathname === "/index.html") pathname = "/";
  if (pathname.endsWith("/index.html")) pathname = pathname.slice(0, -"index.html".length);
  if (pathname !== "/" && !pathname.endsWith("/")) pathname = `${pathname}/`;
  // 404 is not a canonical public page — point crawlers at home.
  if (pathname === "/404/" || pathname.endsWith("/404.html")) {
    return `${origin}/`;
  }
  return `${origin}${pathname}`;
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "") || url;
}

export function organizationJsonLd(site: string) {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: site,
    description:
      "effiq ranks LLM reasoning variants by capability per task dollar.",
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(site, "/apple-touch-icon.png"),
      width: 180,
      height: 180,
    },
  };
}

export function websiteJsonLd(site: string) {
  return {
    "@type": "WebSite",
    "@id": `${stripTrailingSlash(site)}/#website`,
    name: SITE_NAME,
    url: site,
    description: PAGES.home.description,
    publisher: { "@id": `${stripTrailingSlash(site)}/#organization` },
  };
}

export function webApplicationJsonLd(site: string, generatedAt?: string) {
  return {
    "@type": "WebApplication",
    name: SITE_NAME,
    url: site,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    description: PAGES.home.description,
    ...(generatedAt ? { dateModified: generatedAt } : {}),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

export function datasetJsonLd(site: string, generatedAt?: string) {
  return {
    "@type": "Dataset",
    name: "effiq models matrix",
    description:
      "The canonical matrix lists LLM reasoning variants with measured and estimated task costs, latency, throughput, and domain scores.",
    url: absoluteUrl(site, "/api/models.json"),
    isAccessibleForFree: true,
    ...(generatedAt ? { dateModified: generatedAt } : {}),
    license: "https://github.com/smsheese/effiq/blob/main/LICENSE",
    creator: { "@id": `${stripTrailingSlash(site)}/#organization` },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: absoluteUrl(site, "/api/models.json"),
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: absoluteUrl(site, "/api/models.csv"),
      },
    ],
    variableMeasured: [
      "intelligence index",
      "coding index",
      "agentic index",
      "task cost USD",
      "latency",
      "throughput",
    ],
    citation: [
      "https://artificialanalysis.ai",
      "https://openrouter.ai",
      "https://cursor.com/docs/models-and-pricing",
      "https://opencode.ai/docs/go/",
    ],
  };
}

export function breadcrumbJsonLd(
  site: string,
  crumbs: Array<{ name: string; path: string }>,
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(site, crumb.path),
    })),
  };
}

export function buildJsonLdGraph(site: string, extra: object[] = []) {
  const orgId = `${stripTrailingSlash(site)}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...organizationJsonLd(site), "@id": orgId },
      ...extra,
    ],
  };
}
