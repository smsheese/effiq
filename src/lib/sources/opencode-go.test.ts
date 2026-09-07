import { describe, expect, it } from "vitest";
import { adaptOpenCodeGo, type OpenCodeGoCatalog } from "./opencode-go";

const CATALOG: OpenCodeGoCatalog = {
  benchmark: "OpenCode Go",
  url: "https://opencode.ai/docs/go/",
  modelsUrl: "https://opencode.ai/zen/go/v1/models",
  observedAt: "2026-09-07T00:00:00.000Z",
  results: [
    {
      modelId: "kimi-k2.7-code",
      displayName: "Kimi K2.7 Code",
      provider: "Moonshot via OpenCode Go",
      endpoint: "https://opencode.ai/zen/go/v1/chat/completions",
      priceInputUsdPerMillion: 0.95,
      priceOutputUsdPerMillion: 4.0,
      priceCacheReadUsdPerMillion: 0.19,
      priceCacheWriteUsdPerMillion: null,
      monthlyUsageUsd: 60,
      notes: null,
    },
  ],
};

describe("adaptOpenCodeGo", () => {
  it("emits an opencode-channel variant with measured published pricing", () => {
    const [v] = adaptOpenCodeGo(CATALOG, CATALOG.observedAt);
    expect(v.offers[0].channel).toBe("opencode");
    expect(v.offers[0].id).toBe("opencode-go:kimi-k2.7-code");
    expect(v.metrics.inputUsdPerMillion?.value).toBe(0.95);
    expect(v.metrics.inputUsdPerMillion?.source).toBe("opencode");
    expect(v.metrics.inputUsdPerMillion?.status).toBe("measured");
    expect(v.provenance[0].source).toBe("opencode");
  });
});
