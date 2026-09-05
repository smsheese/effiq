/**
 * Hierarchical estimator for incomplete reasoning/thinking variants.
 */

import {
  ESTIMATOR_VERSION,
  EFFORT_ORDER,
  effortRank,
  type EffortLevel,
  type EvidenceStatus,
  type ModelVariant,
  type SourcedNumber,
} from "./schema";

export type MetricField =
  | "intelligence"
  | "coding"
  | "agentic"
  | "taskCostUsd"
  | "throughputTps"
  | "ttftSeconds"
  | "latencyMs"
  | "inputUsdPerMillion"
  | "outputUsdPerMillion";

function measuredValue(v: ModelVariant, field: MetricField): number | null {
  const m = v.metrics[field];
  if (!m || m.status !== "measured" || !Number.isFinite(m.value)) return null;
  return m.value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Typical relative effort multipliers for cost/tokens when family data is sparse.
 * Capability deltas are learned from measured siblings when possible.
 */
const EFFORT_COST_MULT: Record<EffortLevel, number> = {
  none: 0.55,
  minimal: 0.65,
  low: 0.8,
  medium: 1,
  high: 1.35,
  xhigh: 1.7,
  max: 2.1,
  unknown: 1,
};

export function estimateMetric(
  target: ModelVariant,
  family: ModelVariant[],
  field: MetricField,
  observedAt: string,
): SourcedNumber | null {
  const exact = measuredValue(target, field);
  if (exact != null) {
    return {
      value: exact,
      unit: unitFor(field),
      source: target.metrics[field]!.source,
      observedAt: target.metrics[field]!.observedAt,
      confidence: target.metrics[field]!.confidence,
      status: "measured",
      method: "exact_measured",
      sampleCount: 1,
      sourceVariants: [target.canonicalId],
      estimatorVersion: ESTIMATOR_VERSION,
    };
  }

  const measured = family
    .map((v) => ({ v, value: measuredValue(v, field) }))
    .filter((x): x is { v: ModelVariant; value: number } => x.value != null)
    .sort((a, b) => effortRank(a.v.effort) - effortRank(b.v.effort));

  if (measured.length === 0) return null;

  const targetRank = effortRank(target.effort);
  if (targetRank < 0 && measured.length < 2) return null;

  // Interpolation between bracketing efforts
  const below = [...measured].reverse().find((m) => effortRank(m.v.effort) <= targetRank);
  const above = measured.find((m) => effortRank(m.v.effort) >= targetRank);

  if (below && above && below.v.canonicalId !== above.v.canonicalId) {
    const r0 = effortRank(below.v.effort);
    const r1 = effortRank(above.v.effort);
    const t = r1 === r0 ? 0 : (targetRank - r0) / (r1 - r0);
    const value = lerp(below.value, above.value, t);
    const spread = Math.abs(above.value - below.value) * 0.25;
    return makeEstimate(field, value, value - spread, value + spread, "interpolated", 0.75, [
      below.v.canonicalId,
      above.v.canonicalId,
    ], observedAt, "same_family_interpolation");
  }

  // Extrapolate from nearest
  if (measured.length >= 1) {
    const nearest = measured.reduce((best, cur) =>
      Math.abs(effortRank(cur.v.effort) - targetRank) < Math.abs(effortRank(best.v.effort) - targetRank)
        ? cur
        : best,
    );
    const costish = field === "taskCostUsd" || field === "ttftSeconds" || field === "latencyMs";
    const capability = field === "intelligence" || field === "coding" || field === "agentic";

    let value = nearest.value;
    if (costish) {
      const base = EFFORT_COST_MULT[nearest.v.effort] || 1;
      const tgt = EFFORT_COST_MULT[target.effort] || 1;
      value = nearest.value * (tgt / base);
    } else if (capability) {
      // Mild capability bump/drop per effort step; capped
      const steps = targetRank - effortRank(nearest.v.effort);
      value = nearest.value + steps * (field === "intelligence" ? 1.2 : 1.5);
      value = Math.max(0, Math.min(100, value));
    }

    const conf = clamp01(0.55 - 0.08 * Math.abs(targetRank - effortRank(nearest.v.effort)));
    const spread = Math.abs(value - nearest.value) * 0.4 + Math.abs(nearest.value) * 0.08;
    return makeEstimate(
      field,
      value,
      value - spread,
      value + spread,
      "extrapolated",
      conf,
      [nearest.v.canonicalId],
      observedAt,
      "nearest_effort_extrapolation",
    );
  }

  // Family aggregate
  if (measured.length >= 2) {
    const avg = measured.reduce((s, m) => s + m.value, 0) / measured.length;
    let value = avg;
    if (field === "taskCostUsd") {
      value = avg * (EFFORT_COST_MULT[target.effort] || 1);
    }
    const std = Math.sqrt(
      measured.reduce((s, m) => s + (m.value - avg) ** 2, 0) / measured.length,
    );
    return makeEstimate(
      field,
      value,
      value - std,
      value + std,
      "family_estimate",
      0.4,
      measured.map((m) => m.v.canonicalId),
      observedAt,
      "family_aggregate_effort_curve",
    );
  }

  return null;
}

function unitFor(field: MetricField): string {
  switch (field) {
    case "taskCostUsd":
      return "usd_per_task";
    case "throughputTps":
      return "tokens_per_second";
    case "ttftSeconds":
      return "seconds";
    case "latencyMs":
      return "milliseconds";
    case "inputUsdPerMillion":
    case "outputUsdPerMillion":
      return "usd_per_million_tokens";
    default:
      return "index_0_100";
  }
}

function makeEstimate(
  field: MetricField,
  value: number,
  low: number,
  high: number,
  status: Exclude<EvidenceStatus, "measured" | "insufficient">,
  confidence: number,
  sourceVariants: string[],
  observedAt: string,
  method: string,
): SourcedNumber {
  return {
    value,
    low: Math.min(low, high),
    high: Math.max(low, high),
    unit: unitFor(field),
    source: "derived",
    observedAt,
    confidence,
    status,
    method,
    sampleCount: sourceVariants.length,
    sourceVariants,
    estimatorVersion: ESTIMATOR_VERSION,
    notes: `Estimated ${field} via ${method}`,
  };
}

export function fillMissingMetrics(variants: ModelVariant[], observedAt: string): ModelVariant[] {
  const byFamily = new Map<string, ModelVariant[]>();
  for (const v of variants) {
    const list = byFamily.get(v.familySlug) ?? [];
    list.push(v);
    byFamily.set(v.familySlug, list);
  }

  const fields: MetricField[] = [
    "intelligence",
    "coding",
    "agentic",
    "taskCostUsd",
    "throughputTps",
    "ttftSeconds",
    "latencyMs",
  ];

  return variants.map((v) => {
    const family = byFamily.get(v.familySlug) ?? [v];
    const metrics = { ...v.metrics };
    for (const field of fields) {
      const current = metrics[field];
      if (current && current.status === "measured") continue;
      const est = estimateMetric(v, family, field, observedAt);
      if (est) metrics[field] = est;
    }

    // Token heaviness: relative task cost vs medium effort sibling or family median
    const task = metrics.taskCostUsd;
    if (task) {
      const siblings = family
        .map((s) => measuredValue(s, "taskCostUsd"))
        .filter((x): x is number => x != null && x > 0);
      const baseline =
        siblings.length > 0
          ? siblings.sort((a, b) => a - b)[Math.floor(siblings.length / 2)]
          : task.value;
      if (baseline > 0) {
        metrics.tokenHeaviness = {
          value: task.value / baseline,
          unit: "relative_task_cost",
          source: "derived",
          observedAt,
          confidence: task.confidence * 0.9,
          status: task.status === "measured" ? "measured" : task.status,
          method: "task_cost_vs_family_median",
          estimatorVersion: ESTIMATOR_VERSION,
        };
      }
    }

    const coverage = computeCoverage(metrics);
    return { ...v, metrics, evidenceCoverage: coverage };
  });
}

function computeCoverage(metrics: ModelVariant["metrics"]): number {
  const keys: (keyof ModelVariant["metrics"])[] = [
    "intelligence",
    "coding",
    "agentic",
    "taskCostUsd",
    "throughputTps",
    "latencyMs",
    "inputUsdPerMillion",
    "outputUsdPerMillion",
  ];
  let score = 0;
  for (const k of keys) {
    const m = metrics[k];
    if (!m) continue;
    if (m.status === "measured") score += 1;
    else if (m.status === "interpolated") score += 0.7;
    else if (m.status === "extrapolated") score += 0.45;
    else if (m.status === "family_estimate") score += 0.3;
  }
  return score / keys.length;
}

export function effortIndexLabel(effort: EffortLevel): string {
  return EFFORT_ORDER.includes(effort) ? effort : "unknown";
}
