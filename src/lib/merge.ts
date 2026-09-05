/**
 * Merge measured observations from multiple sources into canonical variants.
 */

import { normalizeSlug, slugCandidates, stringSimilarity } from "./identity";
import { prepareVariants } from "./scoring";
import {
  ESTIMATOR_VERSION,
  SCHEMA_VERSION,
  type MatchEdge,
  type ModelVariant,
  type ModelsMatrix,
  type SourcedNumber,
  type SyncManifest,
} from "./schema";
import { emptyOfferFromAa } from "./sources/artificial-analysis";

const SOURCE_PRIORITY: Record<string, number> = {
  artificial_analysis: 100,
  cursor: 80,
  openrouter: 70,
  derived: 10,
};

function preferMetric(
  a: SourcedNumber | null,
  b: SourcedNumber | null,
): SourcedNumber | null {
  if (!a) return b;
  if (!b) return a;
  if (a.status === "measured" && b.status !== "measured") return a;
  if (b.status === "measured" && a.status !== "measured") return b;
  const pa = SOURCE_PRIORITY[a.source] ?? 0;
  const pb = SOURCE_PRIORITY[b.source] ?? 0;
  if (pb !== pa) return pb > pa ? b : a;
  return new Date(b.observedAt) > new Date(a.observedAt) ? b : a;
}

function mergeMetrics(a: ModelVariant["metrics"], b: ModelVariant["metrics"]): ModelVariant["metrics"] {
  return {
    intelligence: preferMetric(a.intelligence, b.intelligence),
    coding: preferMetric(a.coding, b.coding),
    agentic: preferMetric(a.agentic, b.agentic),
    elo: preferMetric(a.elo, b.elo),
    taskCostUsd: preferMetric(a.taskCostUsd, b.taskCostUsd),
    aaTotalCostUsd: preferMetric(a.aaTotalCostUsd, b.aaTotalCostUsd),
    throughputTps: preferMetric(a.throughputTps, b.throughputTps),
    ttftSeconds: preferMetric(a.ttftSeconds, b.ttftSeconds),
    latencyMs: preferMetric(a.latencyMs, b.latencyMs),
    inputUsdPerMillion: preferMetric(a.inputUsdPerMillion, b.inputUsdPerMillion),
    outputUsdPerMillion: preferMetric(a.outputUsdPerMillion, b.outputUsdPerMillion),
    cacheReadUsdPerMillion: preferMetric(a.cacheReadUsdPerMillion, b.cacheReadUsdPerMillion),
    cacheWriteUsdPerMillion: preferMetric(a.cacheWriteUsdPerMillion, b.cacheWriteUsdPerMillion),
    tokenHeaviness: preferMetric(a.tokenHeaviness, b.tokenHeaviness),
  };
}

function familyKey(v: ModelVariant): string {
  return normalizeSlug(v.familySlug);
}

function effortKey(v: ModelVariant): string {
  return `${v.effort}|${v.fast ? 1 : 0}|${v.thinking === true ? 1 : v.thinking === false ? 0 : "x"}`;
}

function aliasSet(v: ModelVariant): Set<string> {
  const s = new Set<string>();
  for (const a of v.ids.aliases ?? []) for (const c of slugCandidates(a)) s.add(c);
  if (v.ids.aaSlug) for (const c of slugCandidates(v.ids.aaSlug)) s.add(c);
  if (v.ids.cursorTaskSlug) for (const c of slugCandidates(v.ids.cursorTaskSlug)) s.add(c);
  if (v.ids.cursorModelId) for (const c of slugCandidates(v.ids.cursorModelId)) s.add(c);
  if (v.ids.openrouterPermaslug) for (const c of slugCandidates(v.ids.openrouterPermaslug)) s.add(c);
  s.add(normalizeSlug(v.familySlug));
  return s;
}

function tryMatch(
  a: ModelVariant,
  b: ModelVariant,
): MatchEdge | null {
  const aa = aliasSet(a);
  const bb = aliasSet(b);
  for (const x of aa) {
    if (bb.has(x)) {
      return {
        fromSource: a.provenance[0]?.source ?? "derived",
        toSource: b.provenance[0]?.source ?? "derived",
        method: "exact_slug",
        confidence: 0.95,
      };
    }
  }
  if (familyKey(a) === familyKey(b) && effortKey(a) === effortKey(b)) {
    return {
      fromSource: a.provenance[0]?.source ?? "derived",
      toSource: b.provenance[0]?.source ?? "derived",
      method: "normalized",
      confidence: 0.8,
    };
  }
  const sim = stringSimilarity(a.displayName, b.displayName);
  if (sim >= 0.85 && a.effort === b.effort && a.fast === b.fast) {
    return {
      fromSource: a.provenance[0]?.source ?? "derived",
      toSource: b.provenance[0]?.source ?? "derived",
      method: "fuzzy",
      confidence: sim * 0.6,
    };
  }
  return null;
}

function mergeTwo(base: ModelVariant, incoming: ModelVariant, edge: MatchEdge): ModelVariant {
  return {
    ...base,
    displayName: base.metrics.intelligence ? base.displayName : incoming.displayName,
    provider: base.provider !== "Unknown" ? base.provider : incoming.provider,
    contextWindow: base.contextWindow ?? incoming.contextWindow,
    modalities: {
      input: [...new Set([...base.modalities.input, ...incoming.modalities.input])],
      output: [...new Set([...base.modalities.output, ...incoming.modalities.output])],
    },
    supportsReasoning: base.supportsReasoning || incoming.supportsReasoning,
    ids: {
      ...incoming.ids,
      ...base.ids,
      aliases: [...new Set([...(base.ids.aliases ?? []), ...(incoming.ids.aliases ?? [])])],
    },
    metrics: mergeMetrics(base.metrics, incoming.metrics),
    offers: dedupeOffers([...base.offers, ...incoming.offers]),
    provenance: [...base.provenance, ...incoming.provenance],
    matchEdges: [...base.matchEdges, edge, ...incoming.matchEdges],
    matchConfidence: Math.min(1, Math.max(base.matchConfidence, incoming.matchConfidence, edge.confidence)),
    evidenceCoverage: Math.max(base.evidenceCoverage, incoming.evidenceCoverage),
  };
}

function dedupeOffers(offers: ModelVariant["offers"]): ModelVariant["offers"] {
  const map = new Map<string, (typeof offers)[0]>();
  for (const o of offers) {
    const key = `${o.channel}:${o.providerSlug}:${o.variant}:${o.inputUsdPerMillion}:${o.outputUsdPerMillion}`;
    if (!map.has(key)) map.set(key, o);
  }
  return [...map.values()];
}

export function mergeVariants(groups: ModelVariant[][]): {
  variants: ModelVariant[];
  unmatched: number;
} {
  const pool: ModelVariant[] = [];
  let unmatched = 0;

  for (const group of groups) {
    for (const incoming of group) {
      let bestIdx = -1;
      let bestEdge: MatchEdge | null = null;
      for (let i = 0; i < pool.length; i++) {
        const edge = tryMatch(pool[i], incoming);
        if (!edge) continue;
        if (edge.confidence < 0.55) continue;
        if (!bestEdge || edge.confidence > bestEdge.confidence) {
          bestEdge = edge;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestEdge) {
        pool[bestIdx] = mergeTwo(pool[bestIdx], incoming, bestEdge);
      } else {
        // Prefer keeping AA-first as standalone; others may stay unmatched until crosswalk
        pool.push(incoming);
        if (!incoming.ids.aaUuid && !incoming.metrics.intelligence) unmatched++;
      }
    }
  }

  // Attach AA pricing offers when present
  for (let i = 0; i < pool.length; i++) {
    const offer = emptyOfferFromAa(pool[i]);
    if (offer) pool[i] = { ...pool[i], offers: dedupeOffers([...pool[i].offers, offer]) };
  }

  return { variants: pool, unmatched };
}

function ranges(variants: ModelVariant[]): ModelsMatrix["benchmarkRanges"] {
  const collect = (fn: (v: ModelVariant) => number | null | undefined) => {
    const vals = variants.map(fn).filter((x): x is number => x != null && Number.isFinite(x));
    if (!vals.length) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  };
  return {
    intelligence: collect((v) => v.metrics.intelligence?.value),
    coding: collect((v) => v.metrics.coding?.value),
    agentic: collect((v) => v.metrics.agentic?.value),
    elo: collect((v) => v.metrics.elo?.value),
    taskCostUsd: collect((v) => v.metrics.taskCostUsd?.value),
    throughputTps: collect((v) => v.metrics.throughputTps?.value),
    latencyMs: collect((v) => v.metrics.latencyMs?.value ?? (v.metrics.ttftSeconds?.value != null ? v.metrics.ttftSeconds.value * 1000 : null)),
  };
}

export function buildMatrix(
  groups: ModelVariant[][],
  sourceStatus: SyncManifest["sources"],
  previousIds?: Set<string>,
): ModelsMatrix {
  const generatedAt = new Date().toISOString();
  const { variants: merged, unmatched } = mergeVariants(groups);
  const variants = prepareVariants(merged, generatedAt);

  const ids = new Set(variants.map((v) => v.canonicalId));
  let added = 0;
  let removed = 0;
  let updated = variants.length;
  if (previousIds) {
    for (const id of ids) if (!previousIds.has(id)) added++;
    for (const id of previousIds) if (!ids.has(id)) removed++;
    updated = variants.length - added;
  }

  const manifest: SyncManifest = {
    schemaVersion: SCHEMA_VERSION,
    estimatorVersion: ESTIMATOR_VERSION,
    generatedAt,
    sources: sourceStatus,
    variantCount: variants.length,
    unmatched,
    changesFromPrevious: { added, removed, updated },
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    estimatorVersion: ESTIMATOR_VERSION,
    generatedAt,
    manifest,
    variants,
    benchmarkRanges: ranges(variants),
  };
}

export function matrixToCsv(matrix: ModelsMatrix): string {
  const headers = [
    "canonical_id",
    "family_slug",
    "display_name",
    "provider",
    "effort",
    "fast",
    "thinking",
    "intelligence",
    "intelligence_status",
    "coding",
    "agentic",
    "task_cost_usd",
    "task_cost_status",
    "throughput_tps",
    "latency_ms",
    "input_usd_m",
    "output_usd_m",
    "context",
    "evidence_coverage",
    "match_confidence",
    "openrouter_slug",
    "aa_slug",
    "cursor_task_slug",
  ];
  const lines = [headers.join(",")];
  for (const v of matrix.variants) {
    const row = [
      v.canonicalId,
      v.familySlug,
      v.displayName,
      v.provider,
      v.effort,
      v.fast,
      v.thinking,
      v.metrics.intelligence?.value ?? "",
      v.metrics.intelligence?.status ?? "",
      v.metrics.coding?.value ?? "",
      v.metrics.agentic?.value ?? "",
      v.metrics.taskCostUsd?.value ?? "",
      v.metrics.taskCostUsd?.status ?? "",
      v.metrics.throughputTps?.value ?? "",
      v.metrics.latencyMs?.value ?? "",
      v.metrics.inputUsdPerMillion?.value ?? "",
      v.metrics.outputUsdPerMillion?.value ?? "",
      v.contextWindow ?? "",
      v.evidenceCoverage,
      v.matchConfidence,
      v.ids.openrouterSlug ?? "",
      v.ids.aaSlug ?? "",
      v.ids.cursorTaskSlug ?? "",
    ].map(csvEscape);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
