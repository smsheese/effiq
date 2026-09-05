import type { ModelVariant, ProviderOffer, SourcedNumber } from "../schema";
import {
  canonicalVariantId,
  familySlugFromName,
  normalizeSlug,
  parseEffortFromText,
  parseFast,
} from "../identity";
import { p95 } from "../models";

interface RawEndpointPerf {
  p50_throughput?: number;
  p90_throughput?: number;
  p99_throughput?: number;
  p50_latency?: number;
  p90_latency?: number;
  p99_latency?: number;
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
  hf_slug?: string;
  reasoning_config?: {
    supported_reasoning_efforts?: string[];
  } | null;
  endpoint?: {
    id?: string;
    context_length?: number;
    provider_display_name?: string;
    provider_name?: string;
    provider_slug?: string;
    variant?: string;
    quantization?: string;
    is_free?: boolean;
    pricing?: {
      prompt?: string;
      completion?: string;
      input_cache_read?: string;
    };
    data_policy?: { retainsPrompts?: boolean };
  } | null;
}

export interface OpenRouterCatalog {
  models: RawModel[];
  endpoint_perf?: Record<string, RawEndpointPerf>;
  benchmarks?: Record<
    string,
    {
      aa?: { intelligence_index?: number; coding_index?: number; agentic_index?: number };
      da?: { default_elo?: number; elo_by_category?: Record<string, number> };
    }
  >;
}

function sn(
  value: number | null | undefined,
  unit: string,
  observedAt: string,
  confidence = 0.85,
): SourcedNumber | null {
  if (value == null || !Number.isFinite(value)) return null;
  return {
    value,
    unit,
    source: "openrouter",
    observedAt,
    confidence,
    status: "measured",
    method: "openrouter_catalog",
  };
}

function perfThroughput(perf: RawEndpointPerf | undefined): number | null {
  if (!perf) return null;
  return (
    p95(perf.p90_throughput, perf.p99_throughput) ??
    perf.p99_throughput ??
    perf.p90_throughput ??
    perf.p50_throughput ??
    null
  );
}

function perfLatency(perf: RawEndpointPerf | undefined): number | null {
  if (!perf) return null;
  return (
    p95(perf.p90_latency, perf.p99_latency) ??
    perf.p99_latency ??
    perf.p90_latency ??
    perf.p50_latency ??
    null
  );
}

/**
 * OpenRouter lists one row per model×provider. We emit base variants from the
 * model + supported reasoning efforts, attaching all provider offers.
 */
export function adaptOpenRouter(data: OpenRouterCatalog, observedAt: string): ModelVariant[] {
  const { models, endpoint_perf = {}, benchmarks = {} } = data;
  const byPermaslug = new Map<
    string,
    {
      model: RawModel;
      offers: ProviderOffer[];
    }
  >();

  for (const m of models) {
    if (!m.slug || !m.endpoint) continue;
    const key = m.permaslug || m.slug;
    const e = m.endpoint;
    const perf = endpoint_perf[e.id ?? ""] || {};
    const inP = e.pricing ? parseFloat(e.pricing.prompt ?? "") : NaN;
    const outP = e.pricing ? parseFloat(e.pricing.completion ?? "") : NaN;
    const cacheP = e.pricing ? parseFloat(e.pricing.input_cache_read ?? "") : NaN;

    const offer: ProviderOffer = {
      id: e.id ?? `${m.slug}:${e.provider_slug}`,
      provider: e.provider_display_name || e.provider_name || "Unknown",
      providerSlug: e.provider_slug ?? null,
      channel: "openrouter",
      variant: e.variant ?? "standard",
      quantization: e.quantization ?? null,
      isFree: !!e.is_free,
      zdr: e.data_policy?.retainsPrompts === false,
      contextLength: e.context_length ?? m.context_length ?? null,
      inputUsdPerMillion: Number.isFinite(inP) ? inP * 1e6 : null,
      outputUsdPerMillion: Number.isFinite(outP) ? outP * 1e6 : null,
      cacheReadUsdPerMillion: Number.isFinite(cacheP) ? cacheP * 1e6 : null,
      cacheWriteUsdPerMillion: null,
      throughputTps: perfThroughput(perf),
      latencyMs: perfLatency(perf),
      url: `https://openrouter.ai/${m.slug}`,
    };

    const existing = byPermaslug.get(key);
    if (existing) {
      existing.offers.push(offer);
    } else {
      byPermaslug.set(key, { model: m, offers: [offer] });
    }
  }

  const out: ModelVariant[] = [];

  for (const [permaslug, { model, offers }] of byPermaslug) {
    const bm = benchmarks[permaslug] || {};
    const aa = bm.aa || {};
    const da = bm.da || {};
    let eloBest = da.default_elo ?? null;
    if (eloBest == null && da.elo_by_category) {
      const vals = Object.values(da.elo_by_category).filter((v) => typeof v === "number");
      if (vals.length) eloBest = Math.max(...vals);
    }

    const bestPrice = [...offers].sort(
      (a, b) => (a.inputUsdPerMillion ?? Infinity) - (b.inputUsdPerMillion ?? Infinity),
    )[0];
    const bestTp = [...offers]
      .filter((o) => o.throughputTps != null)
      .sort((a, b) => (b.throughputTps ?? 0) - (a.throughputTps ?? 0))[0];
    const bestLat = [...offers]
      .filter((o) => o.latencyMs != null)
      .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity))[0];

    const name = model.short_name || model.name || model.slug;
    const familySlug = familySlugFromName(name, permaslug);
    const efforts = model.reasoning_config?.supported_reasoning_efforts?.length
      ? model.reasoning_config.supported_reasoning_efforts
      : model.supports_reasoning
        ? ["medium"]
        : ["none"];

    for (const effortRaw of efforts) {
      const effort = parseEffortFromText(effortRaw === "none" ? "non-reasoning" : effortRaw);
      const fast = parseFast(effortRaw);
      const canonicalId = canonicalVariantId({
        familySlug,
        effort,
        thinking: null,
        fast,
        channel: "openrouter",
      });

      out.push({
        canonicalId,
        familySlug,
        displayName: `${name}${effort !== "none" && effort !== "unknown" ? ` (${effort})` : ""}`,
        provider: model.author_display_name || model.author || "Unknown",
        effort,
        thinking: null,
        fast,
        reasoningMode: effort === "none" ? "none" : model.supports_reasoning ? "reasoning" : "unknown",
        contextWindow: model.context_length ?? bestPrice?.contextLength ?? null,
        modalities: {
          input: model.input_modalities ?? ["text"],
          output: model.output_modalities ?? ["text"],
        },
        supportsReasoning: !!model.supports_reasoning,
        ids: {
          openrouterSlug: model.slug,
          openrouterPermaslug: permaslug,
          hfSlug: model.hf_slug,
          aliases: [normalizeSlug(model.slug), normalizeSlug(permaslug), normalizeSlug(name)],
        },
        metrics: {
          intelligence: sn(aa.intelligence_index ?? null, "index_0_100", observedAt, 0.8),
          coding: sn(aa.coding_index ?? null, "index_0_100", observedAt, 0.8),
          agentic: sn(aa.agentic_index ?? null, "index_0_100", observedAt, 0.8),
          elo: sn(eloBest, "elo", observedAt, 0.75),
          taskCostUsd: null,
          aaTotalCostUsd: null,
          throughputTps: sn(bestTp?.throughputTps ?? null, "tokens_per_second", observedAt),
          ttftSeconds: null,
          latencyMs: sn(bestLat?.latencyMs ?? null, "milliseconds", observedAt),
          inputUsdPerMillion: sn(bestPrice?.inputUsdPerMillion ?? null, "usd_per_million_tokens", observedAt),
          outputUsdPerMillion: sn(bestPrice?.outputUsdPerMillion ?? null, "usd_per_million_tokens", observedAt),
          cacheReadUsdPerMillion: sn(
            bestPrice?.cacheReadUsdPerMillion ?? null,
            "usd_per_million_tokens",
            observedAt,
          ),
          cacheWriteUsdPerMillion: null,
          tokenHeaviness: null,
        },
        offers,
        provenance: [
          {
            source: "openrouter",
            pathOrUrl: "https://openrouter.ai/api/frontend/v1/models/find",
            pulledAt: observedAt,
          },
        ],
        matchEdges: [],
        matchConfidence: 0.85,
        evidenceCoverage: 0,
      });
    }
  }

  return out;
}
