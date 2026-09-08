import {
  subscriptionBucketForPrice,
  type SubscriptionCatalog,
  type SubscriptionPlan,
} from "../schema";

export type { SubscriptionCatalog, SubscriptionPlan };

const VALID_IDS = new Set([
  "claude-pro",
  "claude-max-5x",
  "claude-max-20x",
  "chatgpt-plus",
  "chatgpt-pro-100",
  "chatgpt-pro",
  "chatgpt-business",
  "cursor-pro",
  "cursor-pro-plus",
  "cursor-ultra",
  "cursor-teams-standard",
  "cursor-teams-premium",
  "openrouter-20",
  "openrouter-50",
  "openrouter-100",
  "opencode-20",
  "opencode-50",
  "opencode-100",
]);

const CAPACITY_UNITS = new Set(["weekly_hours", "monthly_usd", "session_messages"]);
const CAPACITY_BASIS = new Set(["official", "community", "derived"]);
const PORTABILITY_LEVELS = new Set(["open", "vendor_tools_only", "harness_locked"]);

/**
 * Validate the bundled subscription-plans seed. Prices are measured list
 * prices, except ChatGPT Business (JS-rendered price, flagged estimated);
 * all usage quotas are estimated prose — callers must keep those labels.
 * Unknown plan ids are rejected so typos fail loudly in sync/tests.
 */
export function parseSubscriptionCatalog(raw: unknown): SubscriptionCatalog {
  if (!raw || typeof raw !== "object") throw new Error("subscription catalog must be an object");
  const root = raw as { observedAt?: unknown; plans?: unknown };
  if (typeof root.observedAt !== "string") throw new Error("subscription catalog missing observedAt");
  if (!Array.isArray(root.plans) || root.plans.length === 0) {
    throw new Error("subscription catalog has no plans");
  }
  const plans = root.plans.map((p, i) => validatePlan(p, i));
  return { observedAt: root.observedAt, plans };
}

function validatePlan(p: unknown, index: number): SubscriptionPlan {
  if (!p || typeof p !== "object") throw new Error(`subscription plan #${index} must be an object`);
  const r = p as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== "string" || !VALID_IDS.has(id)) {
    throw new Error(`subscription plan #${index} has unknown id ${JSON.stringify(id)}`);
  }
  const monthlyUsd = r.monthlyUsd;
  if (typeof monthlyUsd !== "number" || !Number.isFinite(monthlyUsd) || monthlyUsd < 0) {
    throw new Error(`subscription plan ${id} needs a finite monthlyUsd`);
  }
  const expectedBucket = subscriptionBucketForPrice(monthlyUsd);
  if (r.bucket !== expectedBucket) {
    throw new Error(
      `subscription plan ${id} bucket ${JSON.stringify(r.bucket)} mismatches price $${monthlyUsd} (expected ${expectedBucket})`,
    );
  }
  if (r.provider !== "Claude" && r.provider !== "ChatGPT" && r.provider !== "Cursor" && r.provider !== "OpenRouter" && r.provider !== "OpenCode Go") {
    throw new Error(`subscription plan ${id} needs provider Claude|ChatGPT|Cursor|OpenRouter|OpenCode Go`);
  }
  if (typeof r.name !== "string" || !r.name) throw new Error(`subscription plan ${id} needs a name`);
  if (typeof r.sourceUrl !== "string" || !r.sourceUrl) {
    throw new Error(`subscription plan ${id} needs a sourceUrl`);
  }
  if (typeof r.observedAt !== "string" || !r.observedAt) {
    throw new Error(`subscription plan ${id} needs an observedAt`);
  }
  if (!Array.isArray(r.modelFamilies) || r.modelFamilies.length === 0 || !r.modelFamilies.every((f) => typeof f === "string" && f)) {
    throw new Error(`subscription plan ${id} needs a non-empty modelFamilies list`);
  }
  if (r.burnFamilies != null && (!Array.isArray(r.burnFamilies) || !r.burnFamilies.every((f) => typeof f === "string" && f))) {
    throw new Error(`subscription plan ${id} has an invalid burnFamilies list`);
  }
  if (r.tariffChannel != null && r.tariffChannel !== "openrouter" && r.tariffChannel !== "cursor" && r.tariffChannel !== "opencode") {
    throw new Error(`subscription plan ${id} has an invalid tariffChannel`);
  }
  const cap = r.capacity as Record<string, unknown> | null;
  if (!cap || typeof cap !== "object") throw new Error(`subscription plan ${id} needs a capacity object`);
  if (!CAPACITY_UNITS.has(cap.unit as string)) {
    throw new Error(`subscription plan ${id} has unknown capacity unit ${JSON.stringify(cap.unit)}`);
  }
  if (!CAPACITY_BASIS.has(cap.basis as string)) {
    throw new Error(`subscription plan ${id} has unknown capacity basis ${JSON.stringify(cap.basis)}`);
  }
  if (typeof cap.low !== "number" || typeof cap.high !== "number" || !Number.isFinite(cap.low) || !Number.isFinite(cap.high) || cap.low <= 0 || cap.high < cap.low) {
    throw new Error(`subscription plan ${id} needs a finite capacity low/high range with 0 < low <= high`);
  }
  if (typeof cap.ref !== "string" || !cap.ref) {
    throw new Error(`subscription plan ${id} needs a capacity ref label`);
  }
  const port = r.portability as Record<string, unknown> | null;
  if (!port || typeof port !== "object") throw new Error(`subscription plan ${id} needs a portability object`);
  if (!PORTABILITY_LEVELS.has(port.level as string)) {
    throw new Error(`subscription plan ${id} has unknown portability level ${JSON.stringify(port.level)}`);
  }
  if (typeof port.tools !== "string" || !port.tools) {
    throw new Error(`subscription plan ${id} needs a portability tools label`);
  }
  if (port.riskNote != null && typeof port.riskNote !== "string") {
    throw new Error(`subscription plan ${id} has an invalid portability riskNote`);
  }
  return r as unknown as SubscriptionPlan;
}

/** Plans sorted by monthly price, ascending — the comparison page order. */
export function sortPlansByPrice(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  return [...plans].sort((a, b) => a.monthlyUsd - b.monthlyUsd || a.id.localeCompare(b.id));
}
