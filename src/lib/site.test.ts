import { describe, expect, it } from "vitest";
import {
  assertProductionSiteUrl,
  absoluteUrl,
  canonicalFromAstroUrl,
  normalizeSiteUrl,
  resolveSiteUrl,
  buildJsonLdGraph,
  websiteJsonLd,
  datasetJsonLd,
} from "./site";

describe("site url helpers", () => {
  it("normalizes origins with a trailing slash", () => {
    expect(normalizeSiteUrl("https://effiq.pages.dev")).toBe("https://effiq.pages.dev/");
    expect(normalizeSiteUrl("https://effiq.pages.dev/")).toBe("https://effiq.pages.dev/");
  });

  it("rejects placeholder example domains in production builds", () => {
    expect(() => assertProductionSiteUrl("https://models.example.com")).toThrow(/placeholder/i);
    expect(() => assertProductionSiteUrl(undefined)).toThrow(/required/i);
  });

  it("allows localhost only when explicitly permitted", () => {
    expect(() => assertProductionSiteUrl("http://localhost:4321")).toThrow(/public production/i);
    process.env.ALLOW_LOCAL_SITE_URL = "1";
    expect(assertProductionSiteUrl("http://localhost:4321")).toBe("http://localhost:4321/");
    delete process.env.ALLOW_LOCAL_SITE_URL;
  });

  it("defaults to localhost outside builds", () => {
    expect(resolveSiteUrl({ isBuild: false })).toBe("http://localhost:4321/");
  });

  it("builds absolute and canonical URLs without double slashes", () => {
    const site = "https://effiq.pages.dev/";
    expect(absoluteUrl(site, "/og.png")).toBe("https://effiq.pages.dev/og.png");
    expect(
      canonicalFromAstroUrl(site, new URL("https://effiq.pages.dev/methodology/")),
    ).toBe("https://effiq.pages.dev/methodology/");
    expect(
      canonicalFromAstroUrl(site, new URL("https://effiq.pages.dev/methodology")),
    ).toBe("https://effiq.pages.dev/methodology/");
    expect(
      canonicalFromAstroUrl(site, new URL("https://effiq.pages.dev/404/")),
    ).toBe("https://effiq.pages.dev/");
  });

  it("emits schema.org graph without LocalBusiness", () => {
    const graph = buildJsonLdGraph("https://effiq.pages.dev/", [
      websiteJsonLd("https://effiq.pages.dev/"),
      datasetJsonLd("https://effiq.pages.dev/"),
    ]);
    const dumped = JSON.stringify(graph);
    expect(dumped).toContain("WebSite");
    expect(dumped).toContain("Dataset");
    expect(dumped).toContain("Organization");
    expect(dumped).not.toContain("LocalBusiness");
  });
});
