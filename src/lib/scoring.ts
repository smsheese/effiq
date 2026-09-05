/**
 * Domain scores, task-cost estimation, and efficiency ranking.
 */

import { fillMissingMetrics } from "./estimation";
import { getProfile, normalizeWeights } from "./profiles";
import type {
  EvidenceStatus,
  MetricWeights,
  ModelVariant,
  ScoredVariant,
  SourcedNumber,
  UsageProfile,
  UsageProfileId,
  WorkloadTemplate,
} from "./schema";

export const DEFAULT_INTELLIGENCE_FLOOR = 40;

export interface RankingOptions {
  profileId: UsageProfileId;
  weights: MetricWeights;
  intelligenceFloor: number | null;
  includeApproximations: boolean;
  minConfidence: number;
  customWorkload?: Partial<WorkloadTemplate> | null;
  conservativeRanking: boolean;
}

function val(m: SourcedNumber | null | undefined, conservative = false): number | null {
  if (!m || !Number.isFinite(m.value)) return null;
  if (conservative && m.low != null && Number.isFinite(m.low)) {
    // For costs, conservative = higher cost; for capability, lower bound
    return m.low;
  }
  return m.value;
}

function costVal(m: SourcedNumber | null | undefined, conservative = false): number | null {
  if (!m || !Number.isFinite(m.value)) return null;
  if (conservative && m.high != null && Number.isFinite(m.high)) return m.high;
  return m.value;
}

export function estimateTaskCostUsd(
  variant: ModelVariant,
  workload: WorkloadTemplate,
): SourcedNumber | null {
  const measured = variant.metrics.taskCostUsd;
  if (measured && measured.status === "measured") return measured;

  const inPrice = val(variant.metrics.inputUsdPerMillion);
  const outPrice = val(variant.metrics.outputUsdPerMillion);
  if (inPrice == null || outPrice == null) {
    return measured ?? null;
  }

  const cachePrice = val(variant.metrics.cacheReadUsdPerMillion) ?? inPrice * 0.1;
  const calls = Math.max(1, workload.repeatedCalls);
  const input = workload.inputTokens * calls;
  const output = (workload.outputTokens + workload.reasoningTokens) * calls;
  const cache = workload.cacheReadTokens * calls;

  const usd =
    (input * inPrice) / 1e6 + (output * outPrice) / 1e6 + (cache * cachePrice) / 1e6;

  // Scale by token heaviness if known
  const heavy = val(variant.metrics.tokenHeaviness);
  const adjusted = heavy != null && heavy > 0 ? usd * Math.min(Math.max(heavy, 0.5), 4) : usd;

  return {
    value: adjusted,
    low: adjusted * 0.75,
    high: adjusted * 1.4,
    unit: "usd_per_task",
    source: "derived",
    observedAt: variant.metrics.inputUsdPerMillion?.observedAt ?? new Date().toISOString(),
    confidence: Math.min(
      0.65,
      (variant.metrics.inputUsdPerMillion?.confidence ?? 0.5) *
        (variant.metrics.outputUsdPerMillion?.confidence ?? 0.5) *
        1.2,
    ),
    status: "family_estimate",
    method: "workload_tariff_estimate",
    notes: `Estimated from ${workload.label}`,
  };
}

export function domainScore(
  variant: ModelVariant,
  profile: UsageProfile,
  conservative: boolean,
): { score: number | null; explanation: string[] } {
  const explanation: string[] = [];
  let weighted = 0;
  let weightSum = 0;

  for (const [key, w] of Object.entries(profile.domainWeights)) {
    if (!w || w <= 0) continue;
    const metricKey =
      key === "intelligence"
        ? "intelligence"
        : key === "coding"
          ? "coding"
          : key === "agentic"
            ? "agentic"
            : "elo";
    const raw = val(variant.metrics[metricKey], conservative && metricKey !== "elo");
    if (raw == null) {
      explanation.push(`Missing ${metricKey}`);
      continue;
    }
    // ELO ~1000-1600 → map roughly to 0-100
    const scaled = metricKey === "elo" ? Math.max(0, Math.min(100, ((raw - 1000) / 600) * 100)) : raw;
    weighted += scaled * w;
    weightSum += w;
    explanation.push(`${metricKey}=${scaled.toFixed(1)}×${w}`);
  }

  if (weightSum <= 0) return { score: null, explanation };
  return { score: weighted / weightSum, explanation };
}

function percentileRank(values: number[], x: number): number {
  if (!values.length) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let less = 0;
  for (const v of sorted) if (v < x) less++;
  return (less / sorted.length) * 100;
}

function logNormalize(values: number[], x: number, invert: boolean): number {
  if (!values.length) return 50;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return 50;
  // log1p for skewed costs
  const lx = Math.log1p(Math.max(0, x - Math.min(0, min)));
  const lmin = Math.log1p(Math.max(0, min - Math.min(0, min)));
  const lmax = Math.log1p(Math.max(0, max - Math.min(0, min)));
  let t = lmax === lmin ? 0.5 : (lx - lmin) / (lmax - lmin);
  t = Math.max(0, Math.min(1, t));
  return (invert ? 1 - t : t) * 100;
}

export function scoreVariants(
  variants: ModelVariant[],
  options: RankingOptions,
): ScoredVariant[] {
  const profile = getProfile(options.profileId);
  const weights = normalizeWeights(options.weights);
  const workload: WorkloadTemplate = {
    ...profile.workload,
    ...(options.customWorkload ?? {}),
  };

  let pool = variants;

  if (!options.includeApproximations) {
    pool = pool.filter((v) => v.metrics.intelligence?.status === "measured");
  }

  pool = pool.filter((v) => v.matchConfidence >= options.minConfidence);

  if (profile.hardRequirements?.requireImageInput) {
    pool = pool.filter((v) => v.modalities.input.some((m) => /image|vision/i.test(m)));
  }

  const withCosts = pool.map((v) => {
    const task = estimateTaskCostUsd(v, workload);
    return { v, task };
  });

  const eligible = withCosts.filter(({ v }) => {
    const intel = val(v.metrics.intelligence, options.conservativeRanking);
    if (options.intelligenceFloor != null) {
      if (intel == null) return false;
      if (intel < options.intelligenceFloor) return false;
    }
    if (profile.hardRequirements?.minCoding != null) {
      const c = val(v.metrics.coding, options.conservativeRanking);
      if (c != null && c < profile.hardRequirements.minCoding) return false;
    }
    if (profile.hardRequirements?.minAgentic != null) {
      const a = val(v.metrics.agentic, options.conservativeRanking);
      if (a != null && a < profile.hardRequirements.minAgentic) return false;
    }
    return true;
  });

  const intelVals = eligible
    .map(({ v }) => val(v.metrics.intelligence, options.conservativeRanking))
    .filter((x): x is number => x != null);
  const codingVals = eligible
    .map(({ v }) => val(v.metrics.coding, options.conservativeRanking))
    .filter((x): x is number => x != null);
  const agentVals = eligible
    .map(({ v }) => val(v.metrics.agentic, options.conservativeRanking))
    .filter((x): x is number => x != null);
  const costVals = eligible
    .map(({ task }) => costVal(task, options.conservativeRanking))
    .filter((x): x is number => x != null && x > 0);
  const latVals = eligible
    .map(({ v }) => {
      const ms = val(v.metrics.latencyMs, false);
      if (ms != null) return ms;
      const s = val(v.metrics.ttftSeconds, false);
      return s != null ? s * 1000 : null;
    })
    .filter((x): x is number => x != null);
  const tpVals = eligible
    .map(({ v }) => val(v.metrics.throughputTps, false))
    .filter((x): x is number => x != null);

  const scored: ScoredVariant[] = eligible.map(({ v, task }) => {
    const explanation: string[] = [];
    const { score: domain, explanation: domainExpl } = domainScore(
      v,
      profile,
      options.conservativeRanking,
    );
    explanation.push(...domainExpl.map((e) => `domain:${e}`));

    const intel = val(v.metrics.intelligence, options.conservativeRanking);
    const coding = val(v.metrics.coding, options.conservativeRanking);
    const agentic = val(v.metrics.agentic, options.conservativeRanking);
    const cost = costVal(task, options.conservativeRanking);
    const latencyMs =
      val(v.metrics.latencyMs, false) ??
      (val(v.metrics.ttftSeconds, false) != null
        ? val(v.metrics.ttftSeconds, false)! * 1000
        : null);
    const throughput = val(v.metrics.throughputTps, false);

    const parts: Array<{ key: keyof MetricWeights; n: number | null; weight: number }> = [
      {
        key: "intelligence",
        n: intel != null ? percentileRank(intelVals, intel) : null,
        weight: weights.intelligence,
      },
      {
        key: "coding",
        n: coding != null ? percentileRank(codingVals, coding) : null,
        weight: weights.coding,
      },
      {
        key: "agentic",
        n: agentic != null ? percentileRank(agentVals, agentic) : null,
        weight: weights.agentic,
      },
      {
        key: "task_cost",
        n: cost != null ? logNormalize(costVals, cost, true) : null,
        weight: weights.task_cost,
      },
      {
        key: "latency",
        n: latencyMs != null ? logNormalize(latVals, latencyMs, true) : null,
        weight: weights.latency,
      },
      {
        key: "throughput",
        n: throughput != null ? percentileRank(tpVals, throughput) : null,
        weight: weights.throughput,
      },
    ];

    let wSum = 0;
    let scoreSum = 0;
    for (const p of parts) {
      if (p.n == null || p.weight <= 0) continue;
      scoreSum += p.n * p.weight;
      wSum += p.weight;
      explanation.push(`${p.key}:${p.n.toFixed(1)}×${p.weight.toFixed(0)}`);
    }

    let efficiencyScore = wSum > 0 ? scoreSum / wSum : null;

    // Coverage + confidence penalties
    const conf = Math.min(1, v.matchConfidence * 0.5 + v.evidenceCoverage * 0.5);
    const coveragePenalty = 1 - (1 - v.evidenceCoverage) * 0.25;
    const approxPenalty =
      task?.status && task.status !== "measured" ? 0.92 : 1;
    if (efficiencyScore != null) {
      efficiencyScore = efficiencyScore * coveragePenalty * approxPenalty * (0.85 + 0.15 * conf);
      explanation.push(
        `penalties: coverage=${coveragePenalty.toFixed(2)} approx=${approxPenalty.toFixed(2)} conf=${conf.toFixed(2)}`,
      );
    }

    let capabilityPerDollar: number | null = null;
    if (domain != null && cost != null && cost > 0) {
      capabilityPerDollar = domain / cost;
    }

    let domainEfficiency: number | null = null;
    if (domain != null && cost != null && cost > 0) {
      // Normalize domain/cost into 0-100-ish via percentile of capabilityPerDollar
      domainEfficiency = domain; // placeholder filled after pass
    }

    return {
      variant: v,
      domainScore: domain,
      domainEfficiencyScore: domainEfficiency,
      efficiencyScore,
      capabilityPerDollar,
      effectiveTaskCostUsd: cost,
      taskCostStatus: (task?.status ?? "insufficient") as EvidenceStatus,
      intelligenceForGate: intel,
      confidence: conf,
      explanation,
    };
  });

  const cpd = scored
    .map((s) => s.capabilityPerDollar)
    .filter((x): x is number => x != null && Number.isFinite(x));
  for (const s of scored) {
    if (s.capabilityPerDollar != null) {
      s.domainEfficiencyScore = percentileRank(cpd, s.capabilityPerDollar);
    }
  }

  scored.sort((a, b) => {
    const ae = a.efficiencyScore ?? -1;
    const be = b.efficiencyScore ?? -1;
    if (be !== ae) return be - ae;
    const ac = a.capabilityPerDollar ?? -1;
    const bc = b.capabilityPerDollar ?? -1;
    return bc - ac;
  });

  return scored;
}

export function prepareVariants(variants: ModelVariant[], observedAt?: string): ModelVariant[] {
  return fillMissingMetrics(variants, observedAt ?? new Date().toISOString());
}
