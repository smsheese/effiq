import { describe, expect, it } from "vitest";
import { parseEffortFromText, normalizeSlug, familySlugFromName } from "./identity";
import { estimateMetric, fillMissingMetrics } from "./estimation";
import { DEFAULT_EFFICIENCY_WEIGHTS, getProfile, normalizeWeights, USAGE_PROFILES } from "./profiles";
import {
  DEFAULT_INTELLIGENCE_FLOOR,
  estimateTaskCostUsd,
  prepareVariants,
  scoreVariants,
} from "./scoring";
import type { ModelVariant, SourcedNumber } from "./schema";

function metric(value: number, status: SourcedNumber["status"] = "measured"): SourcedNumber {
  return {
    value,
    unit: "index_0_100",
    source: "artificial_analysis",
    observedAt: "2026-09-05T00:00:00Z",
    confidence: 0.9,
    status,
  };
}

function baseVariant(partial: Partial<ModelVariant> & { canonicalId: string; familySlug: string }): ModelVariant {
  return {
    displayName: partial.displayName ?? partial.canonicalId,
    provider: "Test",
    effort: "medium",
    thinking: false,
    fast: false,
    reasoningMode: "reasoning",
    contextWindow: 128000,
    modalities: { input: ["text"], output: ["text"] },
    supportsReasoning: true,
    ids: {},
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
      inputUsdPerMillion: metric(1, "measured"),
      outputUsdPerMillion: metric(5, "measured"),
      cacheReadUsdPerMillion: metric(0.1, "measured"),
      cacheWriteUsdPerMillion: null,
      tokenHeaviness: null,
      ...(partial.metrics ?? {}),
    },
    offers: [],
    provenance: [],
    matchEdges: [],
    matchConfidence: 1,
    evidenceCoverage: 0.5,
    ...partial,
  };
}

describe("identity", () => {
  it("normalizes slugs across dot/hyphen", () => {
    expect(normalizeSlug("openai/gpt-5.6-luna")).toBe("gpt-5-6-luna");
    expect(normalizeSlug("gpt-5-6-luna-low")).toBe("gpt-5-6-luna-low");
  });

  it("parses effort from names", () => {
    expect(parseEffortFromText("GPT-5.6 Luna (high)")).toBe("high");
    expect(parseEffortFromText("Claude (Non-reasoning)")).toBe("none");
    expect(parseEffortFromText("Grok (xhigh)")).toBe("xhigh");
  });

  it("strips effort for family slug", () => {
    expect(familySlugFromName("GPT-5.6 Luna (low)", "gpt-5-6-luna-low")).toContain("gpt-5-6-luna");
  });
});

describe("profiles", () => {
  it("exposes eight usage profiles", () => {
    expect(USAGE_PROFILES).toHaveLength(8);
    expect(getProfile("coding").label).toBe("Coding");
  });

  it("normalizes weights to 100", () => {
    const n = normalizeWeights({ intelligence: 1, coding: 1, agentic: 0, task_cost: 1, latency: 0, throughput: 0 });
    const sum = Object.values(n).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 5);
  });
});

describe("estimation", () => {
  it("interpolates intelligence between efforts", () => {
    const low = baseVariant({
      canonicalId: "f::low",
      familySlug: "fam",
      effort: "low",
      metrics: { intelligence: metric(30) } as never,
    });
    // Fix metrics properly
    low.metrics.intelligence = metric(30);
    const high = baseVariant({
      canonicalId: "f::high",
      familySlug: "fam",
      effort: "high",
    });
    high.metrics.intelligence = metric(50);
    const mid = baseVariant({
      canonicalId: "f::medium",
      familySlug: "fam",
      effort: "medium",
    });
    const est = estimateMetric(mid, [low, high, mid], "intelligence", "2026-09-05T00:00:00Z");
    expect(est?.status).toBe("interpolated");
    expect(est?.value).toBeGreaterThan(30);
    expect(est?.value).toBeLessThan(50);
  });

  it("fills missing metrics for a family", () => {
    const a = baseVariant({ canonicalId: "a", familySlug: "x", effort: "low" });
    a.metrics.intelligence = metric(40);
    a.metrics.taskCostUsd = { ...metric(0.1), unit: "usd_per_task" };
    const b = baseVariant({ canonicalId: "b", familySlug: "x", effort: "high" });
    const filled = fillMissingMetrics([a, b], "2026-09-05T00:00:00Z");
    expect(filled[1].metrics.intelligence?.status).not.toBe("measured");
    expect(filled[1].metrics.intelligence?.value).toBeTruthy();
  });
});

describe("scoring", () => {
  it("gates by intelligence floor 40 by default", () => {
    const low = baseVariant({ canonicalId: "low", familySlug: "l" });
    low.metrics.intelligence = metric(35);
    low.metrics.coding = metric(40);
    low.metrics.agentic = metric(30);
    low.metrics.taskCostUsd = { ...metric(0.2), unit: "usd_per_task" };
    const high = baseVariant({ canonicalId: "high", familySlug: "h" });
    high.metrics.intelligence = metric(45);
    high.metrics.coding = metric(50);
    high.metrics.agentic = metric(40);
    high.metrics.taskCostUsd = { ...metric(0.3), unit: "usd_per_task" };

    const scored = scoreVariants(prepareVariants([low, high]), {
      profileId: "general",
      weights: DEFAULT_EFFICIENCY_WEIGHTS,
      intelligenceFloor: DEFAULT_INTELLIGENCE_FLOOR,
      includeApproximations: true,
      minConfidence: 0,
      conservativeRanking: false,
    });
    expect(scored.every((s) => (s.intelligenceForGate ?? 0) >= 40)).toBe(true);
    expect(scored.map((s) => s.variant.canonicalId)).toContain("high");
    expect(scored.map((s) => s.variant.canonicalId)).not.toContain("low");
  });

  it("changes ranking when profile switches to coding", () => {
    const coder = baseVariant({ canonicalId: "coder", familySlug: "c" });
    coder.metrics.intelligence = metric(42);
    coder.metrics.coding = metric(80);
    coder.metrics.agentic = metric(40);
    coder.metrics.taskCostUsd = { ...metric(0.5), unit: "usd_per_task" };
    const generalist = baseVariant({ canonicalId: "gen", familySlug: "g" });
    generalist.metrics.intelligence = metric(55);
    generalist.metrics.coding = metric(40);
    generalist.metrics.agentic = metric(35);
    generalist.metrics.taskCostUsd = { ...metric(0.2), unit: "usd_per_task" };

    const variants = prepareVariants([coder, generalist]);
    const general = scoreVariants(variants, {
      profileId: "general",
      weights: getProfile("general").defaultWeights,
      intelligenceFloor: 40,
      includeApproximations: true,
      minConfidence: 0,
      conservativeRanking: false,
    });
    const coding = scoreVariants(variants, {
      profileId: "coding",
      weights: getProfile("coding").defaultWeights,
      intelligenceFloor: 40,
      includeApproximations: true,
      minConfidence: 0,
      conservativeRanking: false,
    });
    expect(general[0].variant.canonicalId).toBeTruthy();
    expect(coding.find((s) => s.variant.canonicalId === "coder")?.domainScore).toBeGreaterThan(
      coding.find((s) => s.variant.canonicalId === "gen")?.domainScore ?? 0,
    );
  });

  it("estimates task cost from tariffs when AA cost missing", () => {
    const v = baseVariant({ canonicalId: "t", familySlug: "t" });
    v.metrics.inputUsdPerMillion = { ...metric(1), unit: "usd_per_million_tokens" };
    v.metrics.outputUsdPerMillion = { ...metric(5), unit: "usd_per_million_tokens" };
    const cost = estimateTaskCostUsd(v, getProfile("coding").workload);
    expect(cost?.status).not.toBe("measured");
    expect(cost?.value).toBeGreaterThan(0);
  });

  it("includes cursorbench values with higher weightage in cursor section", () => {
    // Model A: High CursorBench (72.8), moderate coding (60)
    const modelA = baseVariant({
      canonicalId: "model-a::xhigh::cursor",
      familySlug: "model-a",
      effort: "xhigh",
      ids: { cursorTaskSlug: "model-a-xhigh" },
    });
    modelA.metrics.intelligence = metric(50);
    modelA.metrics.coding = metric(60);
    modelA.metrics.cursorBench = {
      value: 72.8,
      unit: "percent_0_100",
      source: "cursor",
      observedAt: "2026-09-02T00:00:00Z",
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
    };
    modelA.metrics.cursorBenchCostUsd = {
      value: 2.81,
      unit: "usd_per_task",
      source: "cursor",
      observedAt: "2026-09-02T00:00:00Z",
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
    };

    // Model B: Moderate CursorBench (55.0), high coding (75)
    const modelB = baseVariant({
      canonicalId: "model-b::xhigh::cursor",
      familySlug: "model-b",
      effort: "xhigh",
      ids: { cursorTaskSlug: "model-b-xhigh" },
    });
    modelB.metrics.intelligence = metric(50);
    modelB.metrics.coding = metric(75);
    modelB.metrics.cursorBench = {
      value: 55.0,
      unit: "percent_0_100",
      source: "cursor",
      observedAt: "2026-09-02T00:00:00Z",
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
    };
    modelB.metrics.cursorBenchCostUsd = {
      value: 2.81,
      unit: "usd_per_task",
      source: "cursor",
      observedAt: "2026-09-02T00:00:00Z",
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
    };

    const variants = [modelA, modelB];

    // Standard scoring (all channel)
    const stdScored = scoreVariants(variants, {
      profileId: "coding",
      weights: getProfile("coding").defaultWeights,
      intelligenceFloor: 40,
      includeApproximations: true,
      minConfidence: 0,
      conservativeRanking: false,
      channel: "all",
    });

    // Cursor section scoring (cursor channel)
    const cursorScored = scoreVariants(variants, {
      profileId: "coding",
      weights: getProfile("coding").defaultWeights,
      intelligenceFloor: 40,
      includeApproximations: true,
      minConfidence: 0,
      conservativeRanking: false,
      channel: "cursor",
    });

    const stdA = stdScored.find((s) => s.variant.canonicalId === modelA.canonicalId)!;
    const stdB = stdScored.find((s) => s.variant.canonicalId === modelB.canonicalId)!;
    const cursorA = cursorScored.find((s) => s.variant.canonicalId === modelA.canonicalId)!;
    const cursorB = cursorScored.find((s) => s.variant.canonicalId === modelB.canonicalId)!;

    // Both include cursorbench in explanation
    expect(stdA.explanation.some((e) => e.includes("cursorbench"))).toBe(true);
    expect(cursorA.explanation.some((e) => e.includes("cursor-weighted"))).toBe(true);

    // In cursor section, Model A's domain score relative to Model B increases due to higher CursorBench weight
    const stdDiff = stdB.domainScore! - stdA.domainScore!;
    const cursorDiff = cursorB.domainScore! - cursorA.domainScore!;
    // Model B's advantage from AA coding (75 vs 60) shrinks or flips under CursorBench 2.5x weightage
    expect(cursorDiff).toBeLessThan(stdDiff);
  });
});
