/**
 * Pure data-processing helpers shared by the API and the explorer UI.
 * Ported from the original single-file app (openrouter-models.html).
 */

export const fmtK = (n: number | null | undefined): string | null => {
  if (n == null || !isFinite(n)) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "k";
  return String(Math.round(n));
};

export const fmtPrice = (perTokenUsd: number | null | undefined): string | null => {
  if (perTokenUsd == null || !isFinite(perTokenUsd)) return null;
  const perM = perTokenUsd * 1e6;
  if (perM === 0) return "0";
  if (perM < 0.001) return "$" + perM.toExponential(1);
  return "$" + (perM >= 100 ? Math.round(perM).toLocaleString() : perM.toFixed(perM < 1 ? 4 : 2));
};

export const fmtPriceRange = (minUsd: number | null | undefined, maxUsd: number | null | undefined): string | null => {
  if (minUsd == null) return null;
  const low = fmtPrice(minUsd);
  if (low == null) return null;
  if (maxUsd == null || maxUsd <= minUsd) return low;
  const high = fmtPrice(maxUsd);
  return high == null ? low : `${low} [${high}]`;
};

/**
 * Main value = the mode-selected provider's price; bracket = lowest–highest
 * across all providers. Consistent format in every mode.
 */
export const fmtPriceMode = (repUsd: number | null | undefined, minUsd: number | null | undefined, maxUsd: number | null | undefined): string | null => {
  if (repUsd == null) return fmtPriceRange(minUsd, maxUsd);
  const main = fmtPrice(repUsd);
  const low = fmtPrice(minUsd);
  const high = fmtPrice(maxUsd);
  if (high == null || high === low || minUsd == null || maxUsd == null) return main;
  return `${main} [${low}–${high}]`;
};

export const fmtLat = (ms: number | null | undefined): string | null =>
  ms == null || !isFinite(ms) ? null : ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms";

/**
 * OpenRouter reports p50/p75/p90/p99 percentiles only.
 * Estimate p95 via log-space interpolation between p90 and p99:
 *   p95 = p90 * (p99/p90)^( (0.95-0.90)/(0.99-0.90) ) = p90 * (p99/p90)^(5/9)
 * Falls back to p99 (then p90, then p50) if inputs are missing/invalid.
 */
export const p95 = (p90: number | null | undefined, p99: number | null | undefined): number | null => {
  if (p90 == null || p99 == null) return null;
  if (!isFinite(p90) || !isFinite(p99) || p90 <= 0 || p99 <= 0) return null;
  if (p99 <= p90) return p99;
  return p90 * Math.pow(p99 / p90, 5 / 9);
};

const perfVal = (perf: Record<string, unknown> | undefined, kind: "throughput" | "latency"): number | null => {
  const get = (p: string): number | null => (perf ? (perf[p + "_" + kind] as number) ?? null : null);
  const p90 = get("p90");
  const p99 = get("p99");
  const v = p95(p90, p99);
  if (v != null) return v;
  return p99 ?? p90 ?? get("p50");
};

export interface Endpoint {
  in: number | null;
  out: number | null;
  context_length: number | null;
  throughput: number | null;
  latency: number | null;
  hasPerf: boolean;
  provider: string | null;
  provider_slug: string | null;
  variant: string | null;
  quantization: string | null;
  is_free: boolean;
  zdr: boolean;
}

export interface ModelRow {
  slug: string;
  permaslug: string;
  name: string;
  fullName: string;
  author: string | null;
  in: number | null;
  inMin: number | null;
  inMax: number | null;
  out: number | null;
  outMin: number | null;
  outMax: number | null;
  context_length: number | null;
  intelligence: number | null;
  coding: number | null;
  agentic: number | null;
  elo: number | null;
  eloBest: number | null;
  hasBench: boolean;
  modalities: string[];
  outputs: string[];
  supports_reasoning: boolean;
  url: string;
  isFreeVariant: boolean;
  isBatchVariant: boolean;
  endpoints: Endpoint[];
  providers: number;
  hasPerf: boolean;
  hasZdr: boolean;
}

interface RawEndpointPerf {
  p50_throughput?: number;
  p90_throughput?: number;
  p99_throughput?: number;
  p50_latency?: number;
  p90_latency?: number;
  p99_latency?: number;
  [key: string]: unknown;
}

interface RawModel {
  slug: string;
  permaslug?: string;
  name?: string;
  short_name?: string;
  author?: string;
  author_display_name?: string;
  context_length?: number;
  supports_reasoning?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  endpoint?: {
    id?: string;
    context_length?: number;
    provider_display_name?: string;
    provider_name?: string;
    provider_slug?: string;
    variant?: string;
    quantization?: string;
    is_free?: boolean;
    pricing?: { prompt?: string; completion?: string };
    data_policy?: { retainsPrompts?: boolean };
  };
}

export interface CatalogData {
  models: RawModel[];
  endpoint_perf?: Record<string, RawEndpointPerf>;
  benchmarks?: Record<
    string,
    {
      aa?: { intelligence_index?: number; coding_index?: number; agentic_index?: number };
      da?: { default_elo?: number; elo_by_category?: Record<string, unknown> };
    }
  >;
}

/**
 * Each raw entry = one (model × provider endpoint) pairing.
 * Group by model slug, keeping ALL provider endpoints so the user can switch
 * the "provider mode" (pricing / latency / throughput) at runtime.
 */
export function buildRows(data: CatalogData): ModelRow[] {
  const { models, endpoint_perf = {}, benchmarks = {} } = data;
  const bySlug = new Map<string, ModelRow>();

  for (const m of models) {
    const slug = m.slug;
    if (!slug) continue;
    // Skip models with no live provider endpoint (e.g. `endpoint: null`).
    if (!m.endpoint) continue;

    const e = m.endpoint;
    const perf = endpoint_perf[e.id ?? ""] || {};
    const bm = benchmarks[m.permaslug ?? ""] || {};
    const aa = bm.aa || {};
    const da = bm.da || {};

    const inP = e.pricing ? parseFloat(e.pricing.prompt ?? "") : null;
    const outP = e.pricing ? parseFloat(e.pricing.completion ?? "") : null;
    const dp = e.data_policy || {};

    const endpoint: Endpoint = {
      in: Number.isFinite(inP) ? inP : null,
      out: Number.isFinite(outP) ? outP : null,
      context_length: e.context_length ?? m.context_length ?? null,
      throughput: perfVal(perf, "throughput"),
      latency: perfVal(perf, "latency"),
      hasPerf: !!(perf && (perf.p90_throughput != null || perf.p99_throughput != null || perf.p50_throughput != null)),
      provider: e.provider_display_name || e.provider_name || null,
      provider_slug: e.provider_slug || null,
      variant: e.variant || "standard",
      quantization: e.quantization || null,
      is_free: !!e.is_free,
      zdr: dp.retainsPrompts === false,
    };

    let row = bySlug.get(slug);
    if (!row) {
      const daElo = da.default_elo ?? null;
      let eloBest = daElo;
      if (eloBest == null && da.elo_by_category && typeof da.elo_by_category === "object") {
        const vals = Object.values(da.elo_by_category).filter((v): v is number => typeof v === "number");
        if (vals.length) eloBest = Math.max(...vals);
      }
      row = {
        slug,
        permaslug: m.permaslug || slug,
        name: m.short_name || m.name || slug,
        fullName: m.name || slug,
        author: m.author_display_name || m.author || null,
        in: inP,
        inMin: inP,
        inMax: inP,
        out: outP,
        outMin: outP,
        outMax: outP,
        context_length: e.context_length ?? m.context_length ?? null,
        intelligence: aa.intelligence_index ?? null,
        coding: aa.coding_index ?? null,
        agentic: aa.agentic_index ?? null,
        elo: daElo,
        eloBest,
        hasBench: !!(aa.intelligence_index != null || daElo != null),
        modalities: m.input_modalities || [],
        outputs: m.output_modalities || [],
        supports_reasoning: !!m.supports_reasoning,
        url: "https://openrouter.ai/" + slug,
        isFreeVariant: /:free$/.test(slug),
        isBatchVariant: /:batch$/.test(slug),
        endpoints: [],
        providers: 0,
        hasPerf: false,
        hasZdr: false,
      };
      bySlug.set(slug, row);
    }

    row.endpoints.push(endpoint);
    row.providers += 1;
    if (endpoint.hasPerf) row.hasPerf = true;
    if (endpoint.zdr) row.hasZdr = true;

    if (endpoint.in != null && isFinite(endpoint.in)) {
      if (row.inMin == null || endpoint.in < row.inMin) row.inMin = endpoint.in;
      if (row.inMax == null || endpoint.in > row.inMax) row.inMax = endpoint.in;
    }
    if (endpoint.out != null && isFinite(endpoint.out)) {
      if (row.outMin == null || endpoint.out < row.outMin) row.outMin = endpoint.out;
      if (row.outMax == null || endpoint.out > row.outMax) row.outMax = endpoint.out;
    }
  }

  const rows = [...bySlug.values()];
  for (const r of rows) {
    // in/out for sorting = lowest price across providers (used by pricing mode)
    if (r.inMin != null) r.in = r.inMin;
    if (r.outMin != null) r.out = r.outMin;
  }
  return rows;
}

export type ProviderMode = "pricing" | "latency" | "throughput";

/**
 * Pick the representative endpoint for a model based on the selected mode.
 *   pricing     → lowest input price (ties: has perf data, then standard variant)
 *   latency     → lowest latency among endpoints that have it (ties: lower price)
 *   throughput  → highest throughput among endpoints that have it (ties: lower price)
 * Falls back to the pricing representative when no endpoint has the needed data.
 */
export function selectRep(model: ModelRow, mode: ProviderMode): Endpoint | null {
  const eps = model.endpoints || [];
  if (!eps.length) return null;

  if (mode === "latency") {
    const withLat = eps.filter((e) => e.latency != null);
    if (withLat.length) {
      withLat.sort((a, b) => (a.latency! - b.latency!) || (a.in ?? Infinity) - (b.in ?? Infinity));
      return withLat[0];
    }
  }
  if (mode === "throughput") {
    const withTp = eps.filter((e) => e.throughput != null);
    if (withTp.length) {
      withTp.sort((a, b) => (b.throughput! - a.throughput!) || (a.in ?? Infinity) - (b.in ?? Infinity));
      return withTp[0];
    }
  }
  // pricing (default) / fallback
  const priced = eps.filter((e) => e.in != null);
  const pool = priced.length ? priced : eps;
  pool.sort((a, b) => {
    if ((a.in ?? Infinity) !== (b.in ?? Infinity)) return (a.in ?? Infinity) - (b.in ?? Infinity);
    if (a.hasPerf !== b.hasPerf) return a.hasPerf ? -1 : 1;
    if (a.variant !== b.variant) return a.variant === "standard" ? -1 : 1;
    return 0;
  });
  return pool[0];
}