import type { ModelVariant, ProviderOffer, SourcedNumber } from "../schema";
import {
  canonicalVariantId,
  familySlugFromName,
  normalizeSlug,
  parseEffortFromText,
} from "../identity";

export interface OpenCodeGoItem {
  modelId: string;
  displayName: string;
  provider?: string;
  endpoint?: string;
  priceInputUsdPerMillion: number | null;
  priceOutputUsdPerMillion: number | null;
  priceCacheReadUsdPerMillion?: number | null;
  priceCacheWriteUsdPerMillion?: number | null;
  monthlyUsageUsd?: number | null;
  notes?: string | null;
}

export interface OpenCodeGoCatalog {
  benchmark: string;
  url: string;
  modelsUrl?: string;
  observedAt: string;
  description?: string;
  results: OpenCodeGoItem[];
}

function sn(
  value: number | null | undefined,
  unit: string,
  observedAt: string,
): SourcedNumber | null {
  if (value == null || !Number.isFinite(value)) return null;
  return {
    value,
    unit,
    source: "opencode",
    observedAt,
    confidence: 0.9,
    status: "measured",
    method: "opencode_go_published_pricing",
  };
}

/**
 * Adapt the bundled OpenCode Go pricing seed into canonical variants.
 * Published token prices are measured provider evidence; capability indexes
 * still merge in from Artificial Analysis / CursorBench via buildMatrix.
 */
export function adaptOpenCodeGo(catalog: OpenCodeGoCatalog, observedAt: string): ModelVariant[] {
  return catalog.results
    .filter((r) => r.modelId && r.modelId.trim() !== "")
    .map((r) => {
      const effort = parseEffortFromText(r.displayName) || "unknown";
      const familySlug = familySlugFromName(r.displayName, r.modelId);
      const at = catalog.observedAt || observedAt;

      const offer: ProviderOffer = {
        id: `opencode-go:${r.modelId}`,
        provider: "OpenCode Go",
        providerSlug: "opencode-go",
        channel: "opencode",
        variant: r.modelId,
        quantization: null,
        isFree: false,
        zdr: false,
        contextLength: null,
        inputUsdPerMillion: r.priceInputUsdPerMillion,
        outputUsdPerMillion: r.priceOutputUsdPerMillion,
        cacheReadUsdPerMillion: r.priceCacheReadUsdPerMillion ?? null,
        cacheWriteUsdPerMillion: r.priceCacheWriteUsdPerMillion ?? null,
        throughputTps: null,
        latencyMs: null,
        url: r.endpoint ?? catalog.modelsUrl ?? catalog.url,
      };

      const pricingNotes = [
        "Published OpenCode Go price via OpenCode Zen",
        r.monthlyUsageUsd != null ? `$${r.monthlyUsageUsd} monthly usage included` : null,
        r.notes ?? null,
      ]
        .filter(Boolean)
        .join(". ");

      const withNotes = (m: SourcedNumber | null): SourcedNumber | null =>
        m && pricingNotes ? { ...m, notes: pricingNotes } : m;

      return {
        canonicalId: canonicalVariantId({
          familySlug,
          effort,
          thinking: null,
          fast: false,
          channel: "opencode",
        }),
        familySlug,
        displayName: r.displayName,
        provider: r.provider || "OpenCode Go",
        effort,
        thinking: null,
        fast: false,
        reasoningMode: "unknown",
        contextWindow: null,
        modalities: { input: ["text"], output: ["text"] },
        supportsReasoning: true,
        ids: {
          aliases: [normalizeSlug(r.modelId), normalizeSlug(r.displayName)],
        },
        metrics: {
          intelligence: null,
          coding: null,
          agentic: null,
          elo: null,
          taskCostUsd: null,
          aaTotalCostUsd: null,
          throughputTps: null,
          ttftSeconds: null,
          latencyMs: null,
          taskTimeSeconds: null,
          taskTokens: null,
          inputUsdPerMillion: withNotes(sn(r.priceInputUsdPerMillion, "usd_per_million_tokens", at)),
          outputUsdPerMillion: withNotes(sn(r.priceOutputUsdPerMillion, "usd_per_million_tokens", at)),
          cacheReadUsdPerMillion: withNotes(
            sn(r.priceCacheReadUsdPerMillion ?? null, "usd_per_million_tokens", at),
          ),
          cacheWriteUsdPerMillion: withNotes(
            sn(r.priceCacheWriteUsdPerMillion ?? null, "usd_per_million_tokens", at),
          ),
          tokenHeaviness: null,
        },
        offers: [offer],
        provenance: [
          {
            source: "opencode" as const,
            pathOrUrl: catalog.url,
            pulledAt: at,
            version: catalog.benchmark,
          },
        ],
        matchEdges: [],
        matchConfidence: 0.9,
        evidenceCoverage: 0.4,
      } satisfies ModelVariant;
    });
}
