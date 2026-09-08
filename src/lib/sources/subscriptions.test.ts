import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSubscriptionCatalog, sortPlansByPrice } from "./subscriptions";
import { subscriptionBucketForPrice, subscriptionCostPerTask } from "../schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..");

function loadSeed() {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "data", "subscription-plans.json"), "utf8"));
  return parseSubscriptionCatalog(raw);
}

describe("subscription seed", () => {
  it("parses the bundled coding-focused catalog", () => {
    const catalog = loadSeed();
    expect(catalog.plans.length).toBe(18);
    const ids = catalog.plans.map((p) => p.id).sort();
    expect(ids).toEqual(
      ["chatgpt-business", "chatgpt-plus", "chatgpt-pro", "chatgpt-pro-100", "claude-max-20x", "claude-max-5x", "claude-pro", "cursor-pro", "cursor-pro-plus", "cursor-teams-premium", "cursor-teams-standard", "cursor-ultra", "opencode-100", "opencode-20", "opencode-50", "openrouter-100", "openrouter-20", "openrouter-50"].sort(),
    );
  });

  it("keeps quota evidence estimated; metered budget tiers are estimated prices", () => {
    const catalog = loadSeed();
    for (const p of catalog.plans) {
      expect(p.quotaStatus).toBe("estimated");
      if (p.id.startsWith("openrouter-") || p.id.startsWith("opencode-")) {
        expect(p.priceStatus).toBe("estimated");
      } else {
        expect(p.priceStatus).toBe("measured");
      }
    }
  });

  it("buckets match the $20/$50/$100 page tiers", () => {
    const catalog = loadSeed();
    const byId = Object.fromEntries(catalog.plans.map((p) => [p.id, p]));
    expect(byId["claude-pro"].bucket).toBe("upto-20");
    expect(byId["chatgpt-plus"].bucket).toBe("upto-20");
    expect(byId["cursor-pro"].bucket).toBe("upto-20");
    expect(byId["openrouter-20"].bucket).toBe("upto-20");
    expect(byId["opencode-20"].bucket).toBe("upto-20");
    expect(byId["chatgpt-business"].bucket).toBe("upto-50");
    expect(byId["cursor-teams-standard"].bucket).toBe("upto-50");
    expect(byId["openrouter-50"].bucket).toBe("upto-50");
    expect(byId["opencode-50"].bucket).toBe("upto-50");
    expect(byId["claude-max-5x"].bucket).toBe("upto-100");
    expect(byId["cursor-pro-plus"].bucket).toBe("upto-100");
    expect(byId["chatgpt-pro-100"].bucket).toBe("upto-100");
    expect(byId["openrouter-100"].bucket).toBe("upto-100");
    expect(byId["opencode-100"].bucket).toBe("upto-100");
    expect(byId["claude-max-20x"].bucket).toBe("over-100");
    expect(byId["chatgpt-pro"].bucket).toBe("over-100");
    expect(byId["cursor-ultra"].bucket).toBe("over-100");
    expect(byId["cursor-teams-premium"].bucket).toBe("over-100");
  });

  it("sorts cheapest-first for the comparison page", () => {
    const catalog = loadSeed();
    const sorted = sortPlansByPrice(catalog.plans);
    expect(sorted[0].monthlyUsd).toBe(20);
    expect(sorted[sorted.length - 1].monthlyUsd).toBe(200);
  });

  it("carries model families and native-unit capacities for the advisor", () => {
    const catalog = loadSeed();
    const byId = Object.fromEntries(catalog.plans.map((p) => [p.id, p]));
    expect(byId["claude-pro"].modelFamilies).toContain("claude-opus-5");
    expect(byId["claude-pro"].capacity).toMatchObject({ unit: "weekly_hours", low: 40, high: 80, basis: "official" });
    expect(byId["cursor-pro"].capacity).toMatchObject({ unit: "monthly_usd", low: 20, high: 20 });
    expect(byId["cursor-pro"].burnFamilies).toContain("grok-4-5");
    expect(byId["chatgpt-plus"].capacity).toMatchObject({ unit: "session_messages", low: 10, high: 100, basis: "official" });
    expect(byId["chatgpt-pro-100"].capacity).toMatchObject({ low: 50, high: 500 });
    expect(byId["openrouter-50"].capacity).toMatchObject({ unit: "monthly_usd", low: 50, high: 50, basis: "derived" });
    expect(byId["opencode-50"].capacity).toMatchObject({ unit: "monthly_usd", low: 40, high: 40, basis: "derived" });
    expect(byId["opencode-50"].tariffChannel).toBe("opencode");
  });
});

describe("subscription helpers", () => {
  it("assigns buckets at the tier boundaries", () => {
    expect(subscriptionBucketForPrice(20)).toBe("upto-20");
    expect(subscriptionBucketForPrice(20.01)).toBe("upto-50");
    expect(subscriptionBucketForPrice(100)).toBe("upto-100");
    expect(subscriptionBucketForPrice(100.01)).toBe("over-100");
  });

  it("computes effective $/task and rejects bad input", () => {
    expect(subscriptionCostPerTask(20, 200)).toBeCloseTo(0.1);
    expect(subscriptionCostPerTask(200, 1000)).toBeCloseTo(0.2);
    expect(subscriptionCostPerTask(20, 0)).toBeNull();
  });
});
