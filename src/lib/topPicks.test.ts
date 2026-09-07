import { describe, expect, it } from "vitest";
import { buildTopPicks, TOP_PICKS_LIMIT, loadMatrix } from "./topPicks";
import { DEFAULT_EFFICIENCY_WEIGHTS } from "./profiles";
import { DEFAULT_INTELLIGENCE_FLOOR, type RankingOptions } from "./scoring";

const options: RankingOptions = {
  profileId: "general",
  weights: DEFAULT_EFFICIENCY_WEIGHTS,
  intelligenceFloor: DEFAULT_INTELLIGENCE_FLOOR,
  includeApproximations: true,
  minConfidence: 0.3,
  conservativeRanking: true,
  channel: "all",
};

describe("top picks snapshot", () => {
  const matrix = loadMatrix();

  it("returns at most TOP_PICKS_LIMIT rows with descending scores", () => {
    const snapshot = buildTopPicks(matrix, options);
    expect(snapshot.rows.length).toBeGreaterThan(0);
    expect(snapshot.rows.length).toBeLessThanOrEqual(TOP_PICKS_LIMIT);
    for (let i = 1; i < snapshot.rows.length; i++) {
      expect((snapshot.rows[i - 1].efficiencyScore ?? 0)).toBeGreaterThanOrEqual(
        snapshot.rows[i].efficiencyScore ?? 0,
      );
    }
  });

  it("carries the matrix generatedAt and concrete cost fields", () => {
    const snapshot = buildTopPicks(matrix, options);
    expect(snapshot.generatedAt).toBe(matrix.generatedAt);
    expect(snapshot.variantCount).toBe(matrix.variants.length);
    for (const row of snapshot.rows) {
      expect(row.name).toBeTruthy();
      expect(row.effort).toBeTruthy();
      expect(
        row.efficiencyScore != null ||
          row.taskCostUsd != null ||
          row.intelligence != null,
      ).toBe(true);
    }
  });

  it("names leaders that exist in the rows pool", () => {
    const snapshot = buildTopPicks(matrix, options);
    if (snapshot.leaders.best) {
      expect(
        snapshot.rows.some((r) => r.name === snapshot.leaders.best?.name),
      ).toBe(true);
    }
    expect(snapshot.leaders.cheapest).not.toBeNull();
  });
});
