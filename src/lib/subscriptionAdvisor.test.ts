import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAdvisorData,
  getTaskSize,
  headroomRatio,
  planNeed,
  planVerdictDatum,
  recommend,
  sessionsPerMonth,
  verdictForRange,
  workloadCostUsd,
  type AdvisorPlanDatum,
} from "./subscriptionAdvisor";
import { parseSubscriptionCatalog } from "./sources/subscriptions";
import type { ModelVariant, SourcedNumber } from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

function loadSeed() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "data", "subscription-plans.json"), "utf8"));
  return parseSubscriptionCatalog(raw);
}

function variant(
  familySlug: string,
  intel: number | null,
  tariffs: { inP: number; outP: number; cacheP?: number } | null,
): ModelVariant {
  const sn = (value: number): SourcedNumber => ({
    value,
    unit: "x",
    source: "cursor" as const,
    observedAt: "2026-09-08T00:00:00.000Z",
    confidence: 0.9,
    status: "measured",
  });
  return {
    canonicalId: `${familySlug}:medium`,
    familySlug,
    displayName: familySlug,
    provider: "Test",
    effort: "medium",
    thinking: null,
    fast: false,
    reasoningMode: "reasoning",
    contextWindow: null,
    modalities: { input: ["text"], output: ["text"] },
    supportsReasoning: true,
    ids: {},
    metrics: {
      intelligence: intel == null ? null : sn(intel),
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
      inputUsdPerMillion: tariffs ? sn(tariffs.inP) : null,
      outputUsdPerMillion: tariffs ? sn(tariffs.outP) : null,
      cacheReadUsdPerMillion: tariffs?.cacheP != null ? sn(tariffs.cacheP) : null,
      cacheWriteUsdPerMillion: null,
      tokenHeaviness: null,
    },
    offers: [],
    provenance: [],
    matchEdges: [],
    matchConfidence: 1,
    evidenceCoverage: 1,
  };
}

describe("verdict math", () => {
  it("grades fits/tight/over against capacity ranges", () => {
    expect(verdictForRange(10, 10, 40, 80)).toBe("fits");
    expect(verdictForRange(60, 60, 40, 80)).toBe("tight");
    expect(verdictForRange(100, 100, 40, 80)).toBe("over");
    expect(verdictForRange(10, 50, 40, 80)).toBe("tight");
    expect(verdictForRange(NaN, 10, 40, 80)).toBe("unknown");
  });

  it("computes headroom above 1 with room, below 1 in shortfall", () => {
    expect(headroomRatio(10, 10, 40, 80)).toBeGreaterThan(1);
    expect(headroomRatio(200, 200, 40, 80)).toBeLessThan(1);
    expect(headroomRatio(NaN, 10, 40, 80)).toBeNull();
  });

  it("bursty rhythm concentrates fewer sessions", () => {
    expect(sessionsPerMonth("steady")).toBe(20);
    expect(sessionsPerMonth("bursty")).toBe(8);
  });
});

describe("need math", () => {
  it("expresses weekly hours for Claude-style caps", () => {
    const need = planNeed("weekly_hours", 433, getTaskSize("coding"), "steady", { low: null, high: null });
    expect(need.low).toBeCloseTo(50, 5);
  });

  it("expresses monthly dollar burn for Cursor-style pools", () => {
    const need = planNeed("monthly_usd", 100, getTaskSize("coding"), "steady", { low: 0.5, high: 2 });
    expect(need.low).toBeCloseTo(50, 5);
    expect(need.high).toBeCloseTo(200, 5);
  });

  it("expresses per-session messages for ChatGPT-style windows", () => {
    const steady = planNeed("session_messages", 300, getTaskSize("coding"), "steady", { low: null, high: null });
    expect(steady.low).toBeCloseTo(45, 5);
    const bursty = planNeed("session_messages", 300, getTaskSize("coding"), "bursty", { low: null, high: null });
    expect(bursty.low).toBeGreaterThan(steady.low);
  });
});

describe("workload cost", () => {
  it("prices the coding workload from measured tariffs", () => {
    const cost = workloadCostUsd("coding", { inP: 2, outP: 10, cacheP: 0.2, measured: true });
    // 4 calls x (12k*2 + 1.5k*10 + 4k*10) + 6k*0.2, per million
    expect(cost).toBeCloseTo(4 * (24000 + 15000 + 40000) / 1e6 + 1200 / 1e6, 6);
  });
});

describe("advisor over synthetic plans", () => {
  const datum = (over: Partial<AdvisorPlanDatum> = {}): AdvisorPlanDatum => ({
    id: "p",
    provider: "Claude",
    name: "P",
    monthlyUsd: 20,
    intel: { value: 55, status: "measured", family: "f" },
    effiq: 50,
    burnPerSize: {},
    capacity: { unit: "weekly_hours", low: 40, high: 80, basis: "official", ref: "hrs/wk" },
    portability: { level: "harness_locked", tools: "vendor only", riskNote: null },
    usageWindow5h: null,
    weeklyLimit: null,
    accessLabel: null,
    ...over,
  });

  it("ranks fits above over, then by headroom, then by fee", () => {
    const data = [
      datum({ id: "cheap-over", monthlyUsd: 20, capacity: { unit: "weekly_hours", low: 1, high: 2, basis: "official", ref: "h" } }),
      datum({ id: "pricey-fit", monthlyUsd: 200, capacity: { unit: "weekly_hours", low: 100, high: 200, basis: "official", ref: "h" } }),
      datum({ id: "cheap-fit", monthlyUsd: 20, capacity: { unit: "weekly_hours", low: 40, high: 80, basis: "official", ref: "h" } }),
    ];
    const rec = recommend(data, { tasksPerMonth: 200, sizeId: "coding", rhythm: "steady", intelFloor: 40, monthlyBudget: 500, requirePortable: false });
    expect(rec.bestFit).toBe("cheap-fit");
    expect(rec.cheapestFit).toBe("cheap-fit");
    expect(rec.mostHeadroom).toBe("pricey-fit");
  });

  it("excludes over-budget plans from ranking but still reports their verdict", () => {
    const data = [
      datum({ id: "cheap-over", monthlyUsd: 20, capacity: { unit: "weekly_hours", low: 1, high: 2, basis: "official", ref: "h" } }),
      datum({ id: "pricey-fit", monthlyUsd: 200, capacity: { unit: "weekly_hours", low: 100, high: 200, basis: "official", ref: "h" } }),
      datum({ id: "cheap-fit", monthlyUsd: 20, capacity: { unit: "weekly_hours", low: 40, high: 80, basis: "official", ref: "h" } }),
    ];
    const rec = recommend(data, { tasksPerMonth: 200, sizeId: "coding", rhythm: "steady", intelFloor: 40, monthlyBudget: 100, requirePortable: false });
    expect(rec.ranked.map((r) => r.planId).sort()).toEqual(["cheap-fit", "cheap-over"]);
    expect(rec.bestFit).toBe("cheap-fit");
    const size = getTaskSize("coding");
    const v = planVerdictDatum(
      { ...datum({ id: "pricey-fit", monthlyUsd: 200 }), capacity: { unit: "weekly_hours", low: 100, high: 200, basis: "official", ref: "h" } },
      200, size, "steady", 100,
    );
    expect(v.affordable).toBe(false);
    expect(v.verdict).toBe("fits");
  });

  it("drops plans below the intelligence floor", () => {
    const data = [datum({ id: "dumb", intel: { value: 30, status: "measured", family: "f" } })];
    const rec = recommend(data, { tasksPerMonth: 10, sizeId: "qa", rhythm: "steady", intelFloor: 40, monthlyBudget: null, requirePortable: false });
    expect(rec.ranked).toHaveLength(0);
    expect(rec.bestFit).toBeNull();
  });

  it("requirePortable excludes harness-locked plans from ranking", () => {
    const data = [
      datum({ id: "locked", portability: { level: "harness_locked", tools: "vendor", riskNote: null } }),
      datum({ id: "open", portability: { level: "open", tools: "any tool", riskNote: null }, capacity: { unit: "weekly_hours", low: 40, high: 80, basis: "official", ref: "h" } }),
    ];
    const rec = recommend(data, { tasksPerMonth: 10, sizeId: "qa", rhythm: "steady", intelFloor: 30, monthlyBudget: null, requirePortable: true });
    expect(rec.ranked.map((r) => r.planId)).toEqual(["open"]);
    const off = recommend(data, { tasksPerMonth: 10, sizeId: "qa", rhythm: "steady", intelFloor: 30, monthlyBudget: null, requirePortable: false });
    expect(off.ranked).toHaveLength(2);
  });

  it("mostPortable prefers open plans among fits; portability breaks same-fee ties", () => {
    const data = [
      datum({ id: "locked-fit", portability: { level: "harness_locked", tools: "vendor", riskNote: null } }),
      datum({ id: "open-fit", portability: { level: "open", tools: "any tool", riskNote: null } }),
    ];
    const rec = recommend(data, { tasksPerMonth: 10, sizeId: "qa", rhythm: "steady", intelFloor: 30, monthlyBudget: null, requirePortable: false });
    // Same fee + same Effiq → the portable plan wins bestFit too
    expect(rec.bestFit).toBe("open-fit");
    expect(rec.mostPortable).toBe("open-fit");
  });

  it("cost still leads: cheaper locked plan beats pricier open plan on bestFit", () => {
    const data = [
      datum({ id: "locked-cheap", monthlyUsd: 20, portability: { level: "harness_locked", tools: "vendor", riskNote: null } }),
      datum({ id: "open-pricey", monthlyUsd: 100, portability: { level: "open", tools: "any tool", riskNote: null }, capacity: { unit: "weekly_hours", low: 200, high: 400, basis: "official", ref: "h" } }),
    ];
    const rec = recommend(data, { tasksPerMonth: 10, sizeId: "qa", rhythm: "steady", intelFloor: 30, monthlyBudget: null, requirePortable: false });
    expect(rec.bestFit).toBe("locked-cheap");
    expect(rec.mostPortable).toBe("open-pricey");
  });
});

describe("advisor over the real seed", () => {
  it("parses 18 plans with valid capacities", () => {
    expect(loadSeed().plans.length).toBe(18);
  });

  it("builds intel + burn data from synthetic matrix variants", () => {
    const catalog = loadSeed();
    const variants = [
      variant("claude-opus-5", 54, { inP: 5, outP: 25, cacheP: 0.5 }),
      variant("claude-sonnet-5", 45, { inP: 2, outP: 10, cacheP: 0.2 }),
      variant("grok-4-5", 45, { inP: 2, outP: 6, cacheP: 0.5 }),
      variant("gpt-5-6-sol", 51, { inP: 4, outP: 20, cacheP: 0.4 }),
    ];
    const data = buildAdvisorData({ variants } as never, catalog.plans);
    const byId = Object.fromEntries(data.map((d) => [d.id, d]));
    expect(byId["claude-pro"].intel.value).toBe(54);
    expect(byId["chatgpt-plus"].intel.value).toBe(51);
    // Cursor burn spans cheap Grok to pricey Opus
    const burn = byId["cursor-pro"].burnPerSize.coding;
    expect(burn.low).toBeLessThan(burn.high as number);
    // ChatGPT plans carry no burn families of their own here
    expect(byId["claude-pro"].burnPerSize.coding.low).not.toBeNull();
  });

  it("prices OpenCode burn at Zen channel rates with usable-credit caps", () => {
    const catalog = loadSeed();
    const variants = [
      variant("glm-5-3-flash", 30, { inP: 999, outP: 999 }),
      variant("gpt-5-6-luna", 43, { inP: 999, outP: 999 }),
      variant("grok-4-6", 50, { inP: 999, outP: 999 }),
      variant("claude-opus-5", 54, { inP: 5, outP: 25 }),
    ];
    // Zen offer tariffs beat the (absurd) merged metrics when tariffChannel matches
    const zenRates: Record<string, [number, number]> = { "glm-5-3-flash": [0.15, 0.5], "gpt-5-6-luna": [0.2, 1.2], "grok-4-6": [2.0, 6.0] };
    for (const v of variants) {
      const fam = v.familySlug;
      const zen = zenRates[fam];
      if (!zen) continue;
      v.offers = [{
        id: `opencode-go:${fam}`,
        provider: "OpenCode Go",
        providerSlug: "opencode-go",
        channel: "opencode",
        variant: fam,
        quantization: null,
        isFree: false,
        zdr: false,
        contextLength: null,
        inputUsdPerMillion: zen[0],
        outputUsdPerMillion: zen[1],
        cacheReadUsdPerMillion: null,
        cacheWriteUsdPerMillion: null,
        throughputTps: null,
        latencyMs: null,
        url: null,
      }];
    }
    const data = buildAdvisorData({ variants } as never, catalog.plans);
    const byId = Object.fromEntries(data.map((d) => [d.id, d]));
    const burn = byId["opencode-50"].burnPerSize.coding;
    // Coding workload on GLM Flash at Zen rates ≈ 4 x (12k*0.15 + 1.5k*0.5 + 4k*0.5)/1e6 + tiny cache
    expect(burn.low).toBeGreaterThan(0);
    expect(burn.low as number).toBeLessThan(0.5);
    expect(byId["opencode-50"].capacity).toMatchObject({ low: 40, high: 40 });
    expect(byId["openrouter-20"].intel.value).toBe(54);
    expect(byId["openrouter-20"].capacity).toMatchObject({ low: 20, high: 20, basis: "derived" });
  });

  it("carries portability and effiq scores from the real seed", () => {
    const catalog = loadSeed();
    const variants = [
      variant("claude-opus-5", 54, { inP: 5, outP: 25 }),
      variant("gpt-5-6-sol", 51, { inP: 4, outP: 20 }),
    ];
    const data = buildAdvisorData({ variants } as never, catalog.plans);
    const byId = Object.fromEntries(data.map((d) => [d.id, d]));
    expect(byId["claude-pro"].portability.level).toBe("harness_locked");
    expect(byId["chatgpt-plus"].portability.level).toBe("open");
    expect(byId["cursor-pro"].portability.level).toBe("vendor_tools_only");
    expect(byId["openrouter-20"].portability.level).toBe("open");
    expect(byId["chatgpt-plus"].effiq).not.toBeNull();
  });
});
