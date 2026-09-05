import type { EffortLevel, ModelVariant, ProviderOffer, SourcedNumber } from "../schema";
import {
  canonicalVariantId,
  familySlugFromName,
  normalizeSlug,
  parseEffortFromText,
  parseFast,
  parseThinking,
} from "../identity";

export interface AaRecord {
  id: string;
  name: string;
  slug: string;
  release_date?: string;
  model_creator?: { id: string; name: string };
  evaluations?: {
    artificial_analysis_intelligence_index?: number | null;
    artificial_analysis_coding_index?: number | null;
    artificial_analysis_agentic_index?: number | null;
  };
  artificial_analysis_intelligence_index_cost?: {
    total_cost?: number | null;
    cost_per_task?: { total_cost?: number | null };
  } | null;
  pricing?: {
    price_1m_input_tokens?: number | null;
    price_1m_output_tokens?: number | null;
    price_1m_cache_hit_tokens?: number | null;
    price_1m_cache_write_tokens?: number | null;
  } | null;
  performance?: {
    median_output_tokens_per_second?: number | null;
    median_time_to_first_token_seconds?: number | null;
    median_time_to_first_answer_token_seconds?: number | null;
    median_end_to_end_response_time_seconds?: number | null;
  } | null;
}

function sn(
  value: number | null | undefined,
  unit: string,
  observedAt: string,
  confidence = 0.95,
): SourcedNumber | null {
  if (value == null || !Number.isFinite(value)) return null;
  return {
    value,
    unit,
    source: "artificial_analysis",
    observedAt,
    confidence,
    status: "measured",
    method: "aa_catalog",
  };
}

export function adaptArtificialAnalysis(
  records: AaRecord[],
  observedAt: string,
  intelligenceIndexVersion?: string | number,
): ModelVariant[] {
  return records.map((r) => {
    const effort = parseEffortFromText(r.name) as EffortLevel;
    const thinking = parseThinking(r.name);
    const fast = parseFast(r.name);
    const familySlug = familySlugFromName(r.name, r.slug);
    const provider = r.model_creator?.name ?? "Unknown";
    const evals = r.evaluations ?? {};
    const cost = r.artificial_analysis_intelligence_index_cost;
    const pricing = r.pricing ?? {};
    const perf = r.performance ?? {};

    const ttft = perf.median_time_to_first_token_seconds;
    const latencyMs = ttft != null ? ttft * 1000 : null;

    const variant: ModelVariant = {
      canonicalId: canonicalVariantId({ familySlug, effort, thinking, fast, channel: "aa" }),
      familySlug,
      displayName: r.name,
      provider,
      effort: effort === "unknown" && /reasoning/i.test(r.name) ? "medium" : effort,
      thinking,
      fast,
      reasoningMode: /non[- ]?reasoning/i.test(r.name)
        ? "none"
        : /adaptive/i.test(r.name)
          ? "adaptive"
          : /reasoning|high|medium|low|max|xhigh/i.test(r.name)
            ? "reasoning"
            : "unknown",
      contextWindow: null,
      modalities: { input: ["text"], output: ["text"] },
      supportsReasoning: !/non[- ]?reasoning/i.test(r.name),
      ids: {
        aaUuid: r.id,
        aaSlug: r.slug,
        aaName: r.name,
        aliases: [normalizeSlug(r.slug), normalizeSlug(r.name)],
      },
      metrics: {
        intelligence: sn(evals.artificial_analysis_intelligence_index ?? null, "index_0_100", observedAt),
        coding: sn(evals.artificial_analysis_coding_index ?? null, "index_0_100", observedAt),
        agentic: sn(evals.artificial_analysis_agentic_index ?? null, "index_0_100", observedAt),
        elo: null,
        taskCostUsd: sn(cost?.cost_per_task?.total_cost ?? null, "usd_per_task", observedAt, 0.9),
        aaTotalCostUsd: sn(cost?.total_cost ?? null, "usd", observedAt, 0.9),
        throughputTps: sn(perf.median_output_tokens_per_second ?? null, "tokens_per_second", observedAt),
        ttftSeconds: sn(ttft ?? null, "seconds", observedAt),
        latencyMs: sn(latencyMs, "milliseconds", observedAt),
        inputUsdPerMillion: sn(pricing.price_1m_input_tokens ?? null, "usd_per_million_tokens", observedAt),
        outputUsdPerMillion: sn(pricing.price_1m_output_tokens ?? null, "usd_per_million_tokens", observedAt),
        cacheReadUsdPerMillion: sn(pricing.price_1m_cache_hit_tokens ?? null, "usd_per_million_tokens", observedAt),
        cacheWriteUsdPerMillion: sn(pricing.price_1m_cache_write_tokens ?? null, "usd_per_million_tokens", observedAt),
        tokenHeaviness: null,
      },
      offers: [],
      provenance: [
        {
          source: "artificial_analysis",
          pathOrUrl: "data/artificial-analysis/catalog.json",
          pulledAt: observedAt,
          version: intelligenceIndexVersion != null ? String(intelligenceIndexVersion) : undefined,
        },
      ],
      matchEdges: [],
      matchConfidence: 1,
      evidenceCoverage: 0,
    };
    return variant;
  });
}

export function emptyOfferFromAa(v: ModelVariant): ProviderOffer | null {
  const inP = v.metrics.inputUsdPerMillion?.value;
  const outP = v.metrics.outputUsdPerMillion?.value;
  if (inP == null && outP == null) return null;
  return {
    id: `aa:${v.ids.aaSlug}`,
    provider: v.provider,
    providerSlug: normalizeSlug(v.provider),
    channel: "direct",
    variant: v.effort,
    quantization: null,
    isFree: (inP ?? 0) === 0 && (outP ?? 0) === 0,
    zdr: false,
    contextLength: v.contextWindow,
    inputUsdPerMillion: inP ?? null,
    outputUsdPerMillion: outP ?? null,
    cacheReadUsdPerMillion: v.metrics.cacheReadUsdPerMillion?.value ?? null,
    cacheWriteUsdPerMillion: v.metrics.cacheWriteUsdPerMillion?.value ?? null,
    throughputTps: v.metrics.throughputTps?.value ?? null,
    latencyMs: v.metrics.latencyMs?.value ?? null,
    url: null,
  };
}
