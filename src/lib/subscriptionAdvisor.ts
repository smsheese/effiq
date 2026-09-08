/**
 * Subscription advisor: pure consumption-fit logic for /subscriptions/.
 *
 * Each provider caps usage in its own native unit (Claude: weekly hours,
 * Cursor: monthly API-dollar pools, ChatGPT: messages per 5h window), so
 * every plan is judged in its own unit — the module never converts between
 * units. Cross-plan comparison uses verdict + headroom ratio + fee only.
 *
 * The Astro page embeds buildAdvisorData() output as JSON and re-runs the
 * same small arithmetic in an inline script for slider interactivity. Keep
 * the two in sync: page script mirrors verdictFor/planNeed, and the unit
 * tests here pin the semantics.
 */

import { getProfile } from "./profiles";
import { DEFAULT_EFFICIENCY_WEIGHTS } from "./profiles";
import { scoreVariants } from "./scoring";
import type {
  ModelVariant,
  ModelsMatrix,
  PlanCapacity,
  PlanPortability,
  SubscriptionPlan,
  UsageProfileId,
} from "./schema";

export type Rhythm = "steady" | "bursty";
export type Verdict = "fits" | "tight" | "over" | "unknown";

/** Lower ranks are more portable (usable in more third-party tools). */
export const PORTABILITY_RANK: Record<PlanPortability["level"], number> = {
  open: 0,
  vendor_tools_only: 1,
  harness_locked: 2,
};

export interface TaskSize {
  id: string;
  label: string;
  blurb: string;
  workloadId: UsageProfileId;
  /** Assumed Codex-style messages per task (labeled assumption in UI). */
  msgsPerTask: number;
  /** Assumed active agent hours per task (labeled assumption in UI). */
  hoursPerTask: number;
}

export const TASK_SIZES: TaskSize[] = [
  {
    id: "qa",
    label: "Quick Q&A",
    blurb: "Questions, brainstorming, small chat tasks",
    workloadId: "general",
    msgsPerTask: 1,
    hoursPerTask: 0.08,
  },
  {
    id: "coding",
    label: "Coding task",
    blurb: "Feature, bugfix, PR-sized agent work",
    workloadId: "coding",
    msgsPerTask: 3,
    hoursPerTask: 0.5,
  },
  {
    id: "agent",
    label: "Agent loop",
    blurb: "Multi-step agents, bots, marketing automation",
    workloadId: "agents",
    msgsPerTask: 8,
    hoursPerTask: 1.5,
  },
  {
    id: "research",
    label: "Deep work",
    blurb: "Long research, computer-use, Hermes-style runs",
    workloadId: "research",
    msgsPerTask: 12,
    hoursPerTask: 2.5,
  },
];

export function getTaskSize(id: string): TaskSize {
  return TASK_SIZES.find((s) => s.id === id) ?? TASK_SIZES[1];
}

/** Working sessions per month. Bursty users concentrate load into few heavy days. */
export function sessionsPerMonth(rhythm: Rhythm): number {
  return rhythm === "bursty" ? 8 : 20;
}

export function verdictForRange(
  needLow: number,
  needHigh: number,
  capLow: number,
  capHigh: number,
): Verdict {
  if (![needLow, needHigh, capLow, capHigh].every((n) => Number.isFinite(n) && n > 0)) {
    return "unknown";
  }
  if (needHigh <= capLow) return "fits";
  if (needLow > capHigh) return "over";
  return "tight";
}

/** Mid-capacity divided by mid-need. >1 means headroom, <1 means shortfall. */
export function headroomRatio(needLow: number, needHigh: number, capLow: number, capHigh: number): number | null {
  const need = (needLow + needHigh) / 2;
  const cap = (capLow + capHigh) / 2;
  if (!Number.isFinite(need) || need <= 0 || !Number.isFinite(cap)) return null;
  return cap / need;
}

export interface Tariffs {
  inP: number;
  outP: number;
  cacheP: number;
  measured: boolean;
}

export function tariffsOf(v: ModelVariant, channel?: "openrouter" | "cursor" | "opencode" | null): Tariffs | null {
  if (channel) {
    const offers = v.offers
      .filter((o) => o.channel === channel && o.inputUsdPerMillion != null && o.outputUsdPerMillion != null)
      .sort((a, b) => (a.inputUsdPerMillion ?? Infinity) - (b.inputUsdPerMillion ?? Infinity));
    const best = offers[0];
    if (best) {
      return {
        inP: best.inputUsdPerMillion as number,
        outP: best.outputUsdPerMillion as number,
        cacheP: best.cacheReadUsdPerMillion ?? 0,
        measured: true,
      };
    }
  }
  const inM = v.metrics.inputUsdPerMillion;
  const outM = v.metrics.outputUsdPerMillion;
  if (!inM || !outM || !Number.isFinite(inM.value) || !Number.isFinite(outM.value)) return null;
  const cacheP = v.metrics.cacheReadUsdPerMillion?.value;
  return {
    inP: inM.value,
    outP: outM.value,
    cacheP: Number.isFinite(cacheP) ? (cacheP as number) : 0,
    measured: inM.status === "measured" && outM.status === "measured",
  };
}

/**
 * Workload cost from measured tariffs: repeated calls each burn
 * input+output+reasoning (reasoning billed at output rates), plus one
 * cache-read volume. Mirrors the estimator's blended-cost convention.
 */
export function workloadCostUsd(workloadId: UsageProfileId, t: Tariffs): number {
  const w = getProfile(workloadId).workload;
  const calls = Math.max(1, w.repeatedCalls);
  return (
    (calls * (w.inputTokens * t.inP + w.outputTokens * t.outP + w.reasoningTokens * t.outP) +
      w.cacheReadTokens * t.cacheP) /
    1e6
  );
}

/** Best variant for a family: highest intelligence, measured preferred on ties. */
export function bestVariantForFamily(variants: ModelVariant[], familySlug: string): ModelVariant | null {
  const pool = variants.filter((v) => v.familySlug === familySlug);
  if (!pool.length) return null;
  return [...pool].sort((a, b) => {
    const ai = a.metrics.intelligence?.value ?? -1;
    const bi = b.metrics.intelligence?.value ?? -1;
    if (bi !== ai) return bi - ai;
    const am = a.metrics.intelligence?.status === "measured" ? 1 : 0;
    const bm = b.metrics.intelligence?.status === "measured" ? 1 : 0;
    return bm - am;
  })[0];
}

export interface PlanIntel {
  value: number | null;
  status: string | null;
  family: string | null;
}

export function planIntel(variants: ModelVariant[], plan: SubscriptionPlan): PlanIntel {
  let best: PlanIntel = { value: null, status: null, family: null };
  for (const fam of plan.modelFamilies) {
    const v = bestVariantForFamily(variants, fam);
    const intel = v?.metrics.intelligence;
    if (intel && Number.isFinite(intel.value) && (best.value == null || intel.value > best.value)) {
      best = { value: intel.value, status: intel.status, family: fam };
    }
  }
  return best;
}

export interface BurnRange {
  low: number | null;
  high: number | null;
}

export function planBurnPerSize(
  variants: ModelVariant[],
  plan: SubscriptionPlan,
): Record<string, BurnRange> {
  const fams = plan.burnFamilies?.length ? plan.burnFamilies : plan.modelFamilies;
  const out: Record<string, BurnRange> = {};
  for (const size of TASK_SIZES) {
    const costs: number[] = [];
    for (const fam of fams) {
      const v = bestVariantForFamily(variants, fam);
      if (!v) continue;
      const t = tariffsOf(v, plan.tariffChannel ?? null);
      if (!t) continue;
      costs.push(workloadCostUsd(size.workloadId, t));
    }
    out[size.id] =
      costs.length > 0 ? { low: Math.min(...costs), high: Math.max(...costs) } : { low: null, high: null };
  }
  return out;
}

export interface AdvisorPlanDatum {
  id: string;
  provider: string;
  name: string;
  monthlyUsd: number;
  intel: PlanIntel;
  /** Effiq Score of the plan's smartest model (coding profile, default weights). */
  effiq: number | null;
  burnPerSize: Record<string, BurnRange>;
  capacity: PlanCapacity;
  portability: PlanPortability;
  usageWindow5h: string | null;
  weeklyLimit: string | null;
  accessLabel: string | null;
}

/** JSON-safe per-plan bundle embedded in the page for the inline script. */
export function buildAdvisorData(matrix: ModelsMatrix, plans: SubscriptionPlan[]): AdvisorPlanDatum[] {
  const effiqById = new Map<string, number>();
  for (const s of scoreVariants(matrix.variants, {
    profileId: "coding",
    weights: DEFAULT_EFFICIENCY_WEIGHTS,
    intelligenceFloor: 0,
    includeApproximations: true,
    minConfidence: 0,
    conservativeRanking: false,
    channel: "all",
  })) {
    if (s.efficiencyScore != null) effiqById.set(s.variant.canonicalId, s.efficiencyScore);
  }
  return plans.map((p) => {
    let effiq: number | null = null;
    for (const fam of p.modelFamilies) {
      const v = bestVariantForFamily(matrix.variants, fam);
      const score = v ? effiqById.get(v.canonicalId) ?? null : null;
      if (score != null && (effiq == null || score > effiq)) effiq = score;
    }
    return {
      id: p.id,
      provider: p.provider,
      name: p.name,
      monthlyUsd: p.monthlyUsd,
      intel: planIntel(matrix.variants, p),
      effiq,
      burnPerSize: planBurnPerSize(matrix.variants, p),
      capacity: p.capacity,
      portability: p.portability,
      usageWindow5h: p.usageWindow5h,
      weeklyLimit: p.weeklyLimit,
      accessLabel: p.accessLabel ?? null,
    };
  });
}

export interface AdvisorInputs {
  tasksPerMonth: number;
  sizeId: string;
  rhythm: Rhythm;
  intelFloor: number;
  /** Max monthly fee in USD. Null means no cap ("over $200" territory). */
  monthlyBudget: number | null;
  /** When true, only open plans (usable in third-party tools) are recommended. */
  requirePortable: boolean;
}

export interface PlanNeed {
  low: number;
  high: number;
  label: string;
}

/** Monthly need expressed in the plan's native capacity unit. */
export function planNeed(
  capacityUnit: PlanCapacity["unit"],
  tasksPerMonth: number,
  size: TaskSize,
  rhythm: Rhythm,
  burn: BurnRange,
): PlanNeed {
  if (capacityUnit === "weekly_hours") {
    const weekly = (tasksPerMonth / 4.33) * size.hoursPerTask;
    return { low: weekly, high: weekly, label: `${fmtNum(weekly)} hrs/wk` };
  }
  if (capacityUnit === "monthly_usd") {
    const low = burn.low != null ? tasksPerMonth * burn.low : NaN;
    const high = burn.high != null ? tasksPerMonth * burn.high : NaN;
    return { low, high, label: `$${fmtNum(low)}–$${fmtNum(high)}/mo burn` };
  }
  const perSession = (tasksPerMonth / sessionsPerMonth(rhythm)) * size.msgsPerTask;
  return { low: perSession, high: perSession, label: `${fmtNum(perSession)} msgs/session` };
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 10) return n.toFixed(1);
  if (n < 1000) return Math.round(n).toString();
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export interface DatumVerdict {
  planId: string;
  verdict: Verdict;
  headroom: number | null;
  need: PlanNeed;
  affordable: boolean;
  /** False when requirePortable excludes this plan (locked to vendor tools). */
  toolCompatible: boolean;
}

export function planVerdictDatum(
  d: AdvisorPlanDatum,
  tasksPerMonth: number,
  size: TaskSize,
  rhythm: Rhythm,
  monthlyBudget: number | null,
  requirePortable = false,
): DatumVerdict {
  const burn = d.burnPerSize[size.id] ?? { low: null, high: null };
  const need = planNeed(d.capacity.unit, tasksPerMonth, size, rhythm, burn);
  return {
    planId: d.id,
    verdict: verdictForRange(need.low, need.high, d.capacity.low, d.capacity.high),
    headroom: headroomRatio(need.low, need.high, d.capacity.low, d.capacity.high),
    need,
    affordable: monthlyBudget == null || d.monthlyUsd <= monthlyBudget,
    toolCompatible: !requirePortable || PORTABILITY_RANK[d.portability.level] === 0,
  };
}

const VERDICT_RANK: Record<Verdict, number> = { fits: 0, tight: 1, over: 2, unknown: 3 };

export interface RankedPlan {
  planId: string;
  verdict: Verdict;
  headroom: number | null;
  monthlyUsd: number;
  effiq: number | null;
  portability: number;
}

export interface Recommendation {
  ranked: RankedPlan[];
  bestFit: string | null;
  cheapestFit: string | null;
  mostHeadroom: string | null;
  /** Best fit among portable (open) plans, for third-party-tool users. */
  mostPortable: string | null;
}

export function recommend(
  data: AdvisorPlanDatum[],
  inputs: AdvisorInputs,
): Recommendation {
  const size = getTaskSize(inputs.sizeId);
  const ranked: RankedPlan[] = [];
  for (const d of data) {
    if (d.intel.value == null || d.intel.value < inputs.intelFloor) continue;
    if (inputs.monthlyBudget != null && d.monthlyUsd > inputs.monthlyBudget) continue;
    if (inputs.requirePortable && PORTABILITY_RANK[d.portability.level] !== 0) continue;
    const v = planVerdictDatum(d, inputs.tasksPerMonth, size, inputs.rhythm, inputs.monthlyBudget);
    ranked.push({
      planId: v.planId,
      verdict: v.verdict,
      headroom: v.headroom,
      monthlyUsd: d.monthlyUsd,
      effiq: d.effiq,
      portability: PORTABILITY_RANK[d.portability.level],
    });
  }
  // Priority order: cost fit first, then intelligence (Effiq), then tool portability.
  const byFeeThenIntel = (list: RankedPlan[]) =>
    [...list].sort(
      (a, b) =>
        a.monthlyUsd - b.monthlyUsd ||
        (b.effiq ?? -Infinity) - (a.effiq ?? -Infinity) ||
        a.portability - b.portability,
    );
  const byHeadroom = (list: RankedPlan[]) =>
    [...list].sort((a, b) => (b.headroom ?? -Infinity) - (a.headroom ?? -Infinity));
  const fits = ranked.filter((r) => r.verdict === "fits");
  const roomy = fits.filter((r) => (r.headroom ?? 0) >= 1.5);
  // Best fit: cheapest plan that fits with comfortable (1.5x+) headroom;
  // Effiq and portability break same-fee ties.
  const bestFit = (roomy.length > 0 ? byFeeThenIntel(roomy) : fits.length > 0 ? byFeeThenIntel(fits) : ranked)[0]?.planId ?? null;
  const pool = fits.length > 0 ? fits : ranked.filter((r) => r.verdict === "tight");
  const cheapestFit = pool.length > 0 ? byFeeThenIntel(pool)[0].planId : null;
  const mostHeadroom = pool.length > 0 ? byHeadroom(pool)[0].planId : null;
  const portablePool = ranked.filter((r) => r.portability === 0);
  const portableSource = portablePool.length > 0 ? portablePool : ranked;
  const mostPortable =
    portableSource.length > 0
      ? byFeeThenIntel(portableSource.filter((r) => r.verdict === "fits" || r.verdict === "tight"))[0]?.planId ??
        byFeeThenIntel(portableSource)[0].planId
      : null;
  return { ranked, bestFit, cheapestFit, mostHeadroom, mostPortable };
}

