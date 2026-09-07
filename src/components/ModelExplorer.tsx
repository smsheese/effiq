"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DEFAULT_EFFICIENCY_WEIGHTS,
  USAGE_PROFILES,
  WEIGHT_PRESETS,
  getProfile,
  normalizeWeights,
} from "@/lib/profiles";
import {
  DEFAULT_INTELLIGENCE_FLOOR,
  scoreVariants,
  type RankingOptions,
} from "@/lib/scoring";
import type {
  MetricWeights,
  ModelVariant,
  ModelsMatrix,
  ScoredVariant,
  UsageProfileId,
} from "@/lib/schema";
import {
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { getModelParent } from "@/lib/parents";

const ParetoScatter = React.lazy(() =>
  import("@/components/ParetoScatter").then((m) => ({ default: m.ParetoScatter })),
);
const OpenRouterModelFacts = React.lazy(() =>
  import("@/components/OpenRouterModelFacts").then((m) => ({ default: m.OpenRouterModelFacts })),
);
const CursorModelFacts = React.lazy(() =>
  import("@/components/CursorModelFacts").then((m) => ({ default: m.CursorModelFacts })),
);
const OpenCodeGoModelFacts = React.lazy(() =>
  import("@/components/OpenCodeGoModelFacts").then((m) => ({ default: m.OpenCodeGoModelFacts })),
);

type ProviderChannel = "all" | "openrouter" | "cursor" | "opencode";

const isCursorVariant = (v: ModelVariant) =>
  Boolean(
    v.ids.cursorModelId ||
    v.ids.cursorTaskSlug ||
    v.offers.some((o) => o.channel === "cursor"),
  );

const isOpenRouterVariant = (v: ModelVariant) =>
  Boolean(
    v.ids.openrouterSlug ||
    v.ids.openrouterPermaslug ||
    v.offers.some((o) => o.channel === "openrouter"),
  );

const isOpencodeVariant = (v: ModelVariant) =>
  Boolean(
    v.offers.some((o) => o.channel === "opencode") ||
    v.provenance.some((p) => p.source === "opencode"),
  );

type SortKey =
  | "efficiency"
  | "domainEfficiency"
  | "domain"
  | "capabilityPerDollar"
  | "intelligence"
  | "coding"
  | "agentic"
  | "cursorBench"
  | "taskCost"
  | "taskTokens"
  | "taskTime"
  | "throughput"
  | "latency"
  | "inputCost"
  | "outputCost"
  | "cacheReadCost"
  | "name";

const STORAGE_KEY = "effiq-v1";

const WEIGHT_KEYS = [
  "intelligence",
  "coding",
  "agentic",
  "task_cost",
  "latency",
  "throughput",
] as const;

type WeightKey = (typeof WEIGHT_KEYS)[number];

const MAX_LOCKED = 4;

function weightsMatch(a: MetricWeights, b: MetricWeights, eps = 0.01): boolean {
  return WEIGHT_KEYS.every((k) => Math.abs(a[k] - b[k]) <= eps);
}

function fmtTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1e3)}k`;
  if (n >= 1000) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtPricePerM(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.001) return `$${n.toFixed(4)}`;
  if (n < 0.1) return `$${n.toFixed(3)}`;
  if (n >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.0001) return `$${n.toFixed(6).replace(/0+$/, "")}`;
  if (n < 0.001) return `$${n.toFixed(5).replace(/0+$/, "")}`;
  if (n < 0.01) return `$${n.toFixed(4).replace(/0+$/, "")}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number | null | undefined, d = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function statusBadge(status: string | undefined) {
  if (!status || status === "measured") {
    return (
      <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
        Measured
      </Badge>
    );
  }
  if (status === "interpolated") {
    return <Badge variant="secondary" className="text-[10px]">Interpolated</Badge>;
  }
  if (status === "extrapolated") {
    return <Badge variant="secondary" className="text-[10px]">Extrapolated</Badge>;
  }
  if (status === "family_estimate") {
    return <Badge variant="outline" className="text-[10px]">Estimate</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Unknown</Badge>;
}

function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-sm">{value.toFixed(1)}</span>
    </span>
  );
}

const METRIC_HELP: Record<keyof MetricWeights, { label: string; help: string }> = {
  intelligence: {
    label: "Intelligence",
    help: "This slider sets how much general reasoning changes rank. The source is the Artificial Analysis Intelligence Index.",
  },
  coding: {
    label: "Coding",
    help: "This slider sets how much coding skill changes rank. Sources include SWE-bench, HumanEval, and CursorBench.",
  },
  agentic: {
    label: "Agentic",
    help: "This slider sets how much multi-step tool use and agent benchmarks change rank.",
  },
  task_cost: {
    label: "Task cost",
    help: "This slider sets how much a lower task dollar cost raises rank. A higher weight favors cheaper variants.",
  },
  latency: {
    label: "Latency",
    help: "This slider sets how much faster first-token and round-trip time raises rank.",
  },
  throughput: {
    label: "Throughput",
    help: "This slider sets how much output tokens per second raises rank.",
  },
};

function ControlTitleHelp({
  title,
  help,
  badge,
  className = "",
}: {
  title: React.ReactNode;
  help: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-center justify-between ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help items-center gap-1.5 border-b border-dotted border-muted-foreground/50 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <span>{title}</span>
            <CircleHelp className="size-3 text-muted-foreground/70" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs font-normal">
          {help}
        </TooltipContent>
      </Tooltip>
      {badge !== undefined && (
        <span className="font-mono text-xs font-medium tabular-nums text-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

export function ModelExplorer() {
  const [matrix, setMatrix] = React.useState<ModelsMatrix | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showControls, setShowControls] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [profileId, setProfileId] = React.useState<UsageProfileId>("general");
  const [weights, setWeights] = React.useState<MetricWeights>(DEFAULT_EFFICIENCY_WEIGHTS);
  const [lockedKeys, setLockedKeys] = React.useState<WeightKey[]>([]);
  const [activePreset, setActivePreset] = React.useState<string | null>(null);
  const [intelFloor, setIntelFloor] = React.useState(DEFAULT_INTELLIGENCE_FLOOR);
  const [includeApprox, setIncludeApprox] = React.useState(true);
  const [minConfidence, setMinConfidence] = React.useState(0.3);
  const [conservative, setConservative] = React.useState(true);
  const [effortFilter, setEffortFilter] = React.useState<string>("all");
  const [providerFilter, setProviderFilter] = React.useState<string>("all");
  const [channelFilter, setChannelFilter] = React.useState<ProviderChannel>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("efficiency");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  // hydrate from URL / localStorage
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const profile = params.get("profile") as UsageProfileId | null;
      if (profile && USAGE_PROFILES.some((p) => p.id === profile)) setProfileId(profile);
      const floor = params.get("intel");
      if (floor != null) setIntelFloor(Number(floor));
      const ch = params.get("channel") as ProviderChannel | null;
      if (ch === "all" || ch === "openrouter" || ch === "cursor" || ch === "opencode") setChannelFilter(ch);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          weights?: MetricWeights;
          profileId?: UsageProfileId;
          intelFloor?: number;
          lockedKeys?: WeightKey[];
          activePreset?: string | null;
        };
        if (saved.weights) setWeights(normalizeWeights(saved.weights));
        if (saved.profileId && !params.get("profile")) setProfileId(saved.profileId);
        if (saved.intelFloor != null && !params.get("intel")) setIntelFloor(saved.intelFloor);
        if (Array.isArray(saved.lockedKeys)) {
          setLockedKeys(
            saved.lockedKeys.filter((k): k is WeightKey =>
              (WEIGHT_KEYS as readonly string[]).includes(k),
            ).slice(0, MAX_LOCKED),
          );
        }
        if (typeof saved.activePreset === "string" && WEIGHT_PRESETS[saved.activePreset]) {
          setActivePreset(saved.activePreset);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ weights, profileId, intelFloor, lockedKeys, activePreset }),
    );
    const params = new URLSearchParams(window.location.search);
    params.set("profile", profileId);
    params.set("intel", String(intelFloor));
    if (channelFilter !== "all") params.set("channel", channelFilter);
    else params.delete("channel");
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [weights, profileId, intelFloor, channelFilter, lockedKeys, activePreset]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/models.json", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ModelsMatrix;
      setMatrix(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const applyProfile = (id: UsageProfileId) => {
    setProfileId(id);
    setWeights(normalizeWeights(getProfile(id).defaultWeights));
    setLockedKeys([]);
    setActivePreset(null);
  };

  const applyPreset = (key: string) => {
    const preset = WEIGHT_PRESETS[key];
    if (!preset) return;
    setWeights(normalizeWeights(preset.weights));
    setLockedKeys([]);
    setActivePreset(key);
  };

  const toggleLock = (key: WeightKey) => {
    setLockedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_LOCKED) return prev;
      return [...prev, key];
    });
  };

  // Exact preset match (full highlight). Falls back to last-clicked preset (lighter when modified).
  const matchedPresetKey = React.useMemo(() => {
    for (const [k, p] of Object.entries(WEIGHT_PRESETS)) {
      if (weightsMatch(weights, normalizeWeights(p.weights))) return k;
    }
    return null;
  }, [weights]);

  // If the user drags sliders onto an exact preset mix, adopt it as the active preset.
  React.useEffect(() => {
    if (matchedPresetKey) setActivePreset(matchedPresetKey);
  }, [matchedPresetKey]);

  const displayPresetKey = matchedPresetKey ?? activePreset;

  const options: RankingOptions = React.useMemo(
    () => ({
      profileId,
      weights: normalizeWeights(weights),
      intelligenceFloor: intelFloor,
      includeApproximations: includeApprox,
      minConfidence,
      conservativeRanking: conservative,
      channel: channelFilter,
    }),
    [profileId, weights, intelFloor, includeApprox, minConfidence, conservative, channelFilter],
  );

  const scored = React.useMemo(() => {
    if (!matrix) return [] as ScoredVariant[];
    return scoreVariants(matrix.variants, options);
  }, [matrix, options]);

  const providers = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of scored) set.add(s.variant.provider);
    return [...set].sort();
  }, [scored]);

  const cursorCount = React.useMemo(
    () => scored.filter((s) => isCursorVariant(s.variant)).length,
    [scored],
  );

  const openRouterCount = React.useMemo(
    () => scored.filter((s) => isOpenRouterVariant(s.variant)).length,
    [scored],
  );

  const opencodeCount = React.useMemo(
    () => scored.filter((s) => isOpencodeVariant(s.variant)).length,
    [scored],
  );

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return scored.filter((s) => {
      if (qq) {
        const hay = `${s.variant.displayName} ${s.variant.familySlug} ${s.variant.provider} ${s.variant.ids.openrouterSlug ?? ""} ${s.variant.ids.cursorTaskSlug ?? ""} ${s.variant.ids.cursorModelId ?? ""} ${s.variant.offers.map((o) => o.variant ?? "").join(" ")}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (channelFilter === "cursor" && !isCursorVariant(s.variant)) return false;
      if (channelFilter === "openrouter" && !isOpenRouterVariant(s.variant)) return false;
      if (channelFilter === "opencode" && !isOpencodeVariant(s.variant)) return false;
      if (effortFilter !== "all" && s.variant.effort !== effortFilter) return false;
      if (providerFilter !== "all" && s.variant.provider !== providerFilter) return false;
      return true;
    });
  }, [scored, q, channelFilter, effortFilter, providerFilter]);

  const sorted = React.useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (s: ScoredVariant): number | string | null => {
      switch (sortKey) {
        case "efficiency":
          return s.efficiencyScore;
        case "domainEfficiency":
          return s.domainEfficiencyScore;
        case "domain":
          return s.domainScore;
        case "capabilityPerDollar":
          return s.capabilityPerDollar;
        case "intelligence":
          return s.intelligenceForGate;
        case "coding":
          return s.variant.metrics.coding?.value ?? null;
        case "agentic":
          return s.variant.metrics.agentic?.value ?? null;
        case "cursorBench":
          return s.variant.metrics.cursorBench?.value ?? null;
        case "taskCost":
          return s.effectiveTaskCostUsd;
        case "taskTokens":
          return s.variant.metrics.taskTokens?.value ?? null;
        case "taskTime":
          return s.variant.metrics.taskTimeSeconds?.value ?? null;
        case "throughput":
          return s.variant.metrics.throughputTps?.value ?? null;
        case "latency":
          return s.variant.metrics.latencyMs?.value ?? (s.variant.metrics.ttftSeconds?.value != null ? s.variant.metrics.ttftSeconds.value * 1000 : null);
        case "inputCost":
          return s.variant.metrics.inputUsdPerMillion?.value ?? null;
        case "outputCost":
          return s.variant.metrics.outputUsdPerMillion?.value ?? null;
        case "cacheReadCost":
          return s.variant.metrics.cacheReadUsdPerMillion?.value ?? null;
        case "name":
          return s.variant.displayName;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (typeof av === "string" || typeof bv === "string") {
        return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const leaders = React.useMemo(() => {
    const bestEff = [...sorted]
      .filter((s) => s.efficiencyScore != null)
      .sort((a, b) => (b.efficiencyScore ?? 0) - (a.efficiencyScore ?? 0))[0];
    const cheapest = [...sorted]
      .filter((s) => s.effectiveTaskCostUsd != null)
      .sort((a, b) => (a.effectiveTaskCostUsd ?? Infinity) - (b.effectiveTaskCostUsd ?? Infinity))[0];
    const smartest = [...sorted]
      .filter((s) => s.intelligenceForGate != null)
      .sort((a, b) => (b.intelligenceForGate ?? 0) - (a.intelligenceForGate ?? 0))[0];
    const fastest = [...sorted]
      .filter((s) => s.variant.metrics.throughputTps?.value != null)
      .sort((a, b) => (b.variant.metrics.throughputTps?.value ?? 0) - (a.variant.metrics.throughputTps?.value ?? 0))[0];
    return { bestEff, cheapest, smartest, fastest };
  }, [sorted]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir(
        key === "taskCost" ||
        key === "taskTime" ||
        key === "taskTokens" ||
        key === "latency" ||
        key === "inputCost" ||
        key === "outputCost" ||
        key === "cacheReadCost" ||
        key === "name"
          ? "asc"
          : "desc",
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sorted.map((s) => ({
      rank: sorted.indexOf(s) + 1,
      name: s.variant.displayName,
      effiqScore: s.efficiencyScore,
      domain: s.domainScore,
      taskCost: s.effectiveTaskCostUsd,
      taskTokens: s.variant.metrics.taskTokens?.value ?? null,
      taskTimeSeconds: s.variant.metrics.taskTimeSeconds?.value ?? null,
      inputUsdPerMillion: s.variant.metrics.inputUsdPerMillion?.value ?? null,
      outputUsdPerMillion: s.variant.metrics.outputUsdPerMillion?.value ?? null,
      cacheReadUsdPerMillion: s.variant.metrics.cacheReadUsdPerMillion?.value ?? null,
      intelligence: s.intelligenceForGate,
      profile: profileId,
    })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `effiq-${profileId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setWeight = (key: WeightKey, value: number) => {
    if (lockedKeys.includes(key)) return;
    setWeights((prev) => {
      const lockedSum = lockedKeys.reduce((s, k) => (k === key ? s : s + prev[k]), 0);
      let v = Math.max(0, Math.min(100, value));
      // Locked sliders keep their share, so clamp the moved slider to the free remainder.
      v = Math.min(v, Math.max(0, 100 - lockedSum));
      const others = WEIGHT_KEYS.filter((k) => k !== key && !lockedKeys.includes(k));
      const next = { ...prev, [key]: v } as MetricWeights;
      for (const k of lockedKeys) next[k] = prev[k];
      const remainder = Math.max(0, 100 - lockedSum - v);
      if (others.length === 0) {
        next[key] = 100 - lockedSum;
        return next;
      }
      const prevOtherSum = others.reduce((s, k) => s + prev[k], 0);
      if (prevOtherSum <= 1e-9) {
        const each = remainder / others.length;
        for (const k of others) next[k] = each;
      } else {
        for (const k of others) next[k] = (prev[k] / prevOtherSum) * remainder;
      }
      return next;
    });
  };

  const profile = getProfile(profileId);
  const compareRows = sorted.filter((s) => selected.includes(s.variant.canonicalId));

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "efficiency", label: "Effiq Score" },
    { key: "domainEfficiency", label: "Domain eff." },
    { key: "domain", label: "Domain" },
    { key: "intelligence", label: "Intel" },
    { key: "coding", label: "Coding" },
    { key: "agentic", label: "Agentic" },
    { key: "cursorBench", label: "CursorBench" },
    { key: "taskCost", label: "Task $" },
    { key: "taskTokens", label: "Tokens/task" },
    { key: "taskTime", label: "Task time" },
    { key: "throughput", label: "TPS" },
    { key: "latency", label: "Latency" },
    { key: "inputCost", label: "In $/1M" },
    { key: "outputCost", label: "Out $/1M" },
    { key: "cacheReadCost", label: "Cache $/1M" },
    { key: "capabilityPerDollar", label: "Cap/$" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-[1500px] space-y-8 px-4 pb-10 pt-2">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Highest Effiq Score", row: leaders.bestEff, fmt: (s: ScoredVariant) => fmtNum(s.efficiencyScore) },
          { label: "Lowest task cost", row: leaders.cheapest, fmt: (s: ScoredVariant) => fmtMoney(s.effectiveTaskCostUsd) },
          { label: "Highest intelligence", row: leaders.smartest, fmt: (s: ScoredVariant) => fmtNum(s.intelligenceForGate) },
          { label: "Fastest output", row: leaders.fastest, fmt: (s: ScoredVariant) => s.variant.metrics.throughputTps?.value != null ? `${Math.round(s.variant.metrics.throughputTps.value)} t/s` : "—" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{card.label}</div>
            <div className="mt-2 truncate text-base font-semibold text-foreground">{card.row?.variant.displayName ?? "—"}</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-primary">
              {card.row ? card.fmt(card.row) : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ControlTitleHelp
          title="Profile"
          help="This control selects a usage profile. The profile sets default weights and the token workload for task cost."
          className="mb-0 mr-1"
        />
        {USAGE_PROFILES.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={profileId === p.id ? "default" : "outline"}
            onClick={() => applyProfile(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {profile.description} Workload: <span className="font-medium text-foreground">{profile.workload.label}</span>.
      </p>
      </div>

      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ControlTitleHelp
          title="Provider channel"
          help="This control shows OpenRouter variants, Cursor variants, OpenCode Go variants, or all three. The Cursor view raises CursorBench weight."
          className="mb-0 mr-1"
        />
        <div className="inline-flex rounded-xl border border-border bg-muted/50 p-1 gap-1">
          <Button
            size="sm"
            variant={channelFilter === "all" ? "default" : "outline"}
            onClick={() => setChannelFilter("all")}
            className="h-8 text-xs font-medium"
          >
            All Providers ({scored.length})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "openrouter" ? "default" : "outline"}
            onClick={() => setChannelFilter("openrouter")}
            className="h-8 text-xs font-medium"
          >
            OpenRouter ({openRouterCount})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "cursor" ? "default" : "outline"}
            onClick={() => setChannelFilter("cursor")}
            className="h-8 text-xs font-medium"
          >
            Cursor Models Only ({cursorCount})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "opencode" ? "default" : "outline"}
            onClick={() => setChannelFilter("opencode")}
            className="h-8 text-xs font-medium"
          >
            OpenCode Go ({opencodeCount})
          </Button>
        </div>
        {channelFilter === "cursor" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
            <span className="font-semibold text-primary">Cursor section active:</span>
            <span>
              CursorBench scores use 2.5× weight in domain capability. Measured CursorBench task cost is preferred for Cursor models.
            </span>
          </div>
        )}
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={showControls ? "secondary" : "outline"} size="sm" onClick={() => setShowControls(!showControls)}>
              <SlidersHorizontal /> Ranking controls
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs font-normal">
            This button shows or hides ranking controls. The controls change the floor, weights, and filters.
          </TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={exportJson}>
          <Download /> Export JSON
        </Button>
        <a href="/api/models.csv" className="inline-flex">
          <Button variant="outline" size="sm"><Download /> CSV</Button>
        </a>
        <div className="ml-auto text-sm text-muted-foreground">
          <b className="text-foreground">{sorted.length}</b> / {matrix?.variants.length ?? 0} variants
          {matrix && (
            <span className="ml-2 text-xs">· matrix {new Date(matrix.generatedAt).toLocaleString()}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load matrix: {error}
        </div>
      )}

      {showControls && (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <ControlTitleHelp
              title="Ranking controls"
              help="These controls change which variants appear and how the Effiq Score weights them."
              className="mb-0"
            />
            <div className="text-xs text-muted-foreground">
              Hover a control title to read the term.
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <ControlTitleHelp
                title="Min intelligence"
                badge={intelFloor}
                help="This slider hides variants whose Artificial Analysis Intelligence Index is less than the set floor."
              />
              <Slider
                min={0}
                max={70}
                step={1}
                value={[intelFloor]}
                onValueChange={([v]) => setIntelFloor(v)}
              />
            </div>
            <div>
              <ControlTitleHelp
                title="Min confidence"
                badge={minConfidence.toFixed(2)}
                help="This slider hides variants whose data confidence is less than the set floor. The range is 0.0 to 1.0."
              />
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[minConfidence]}
                onValueChange={([v]) => setMinConfidence(v)}
              />
            </div>
            <div className="flex flex-col justify-end gap-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex cursor-help items-center gap-2 text-sm text-foreground">
                    <Switch checked={includeApprox} onCheckedChange={setIncludeApprox} />
                    <span className="border-b border-dotted border-muted-foreground/60 text-xs font-medium">
                      Include approximations
                    </span>
                    <CircleHelp className="size-3 text-muted-foreground/70" />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                  When this switch is on, the table includes variants that use interpolated or family estimates.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex cursor-help items-center gap-2 text-sm text-foreground">
                    <Switch checked={conservative} onCheckedChange={setConservative} />
                    <span className="border-b border-dotted border-muted-foreground/60 text-xs font-medium">
                      Conservative bounds
                    </span>
                    <CircleHelp className="size-3 text-muted-foreground/70" />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                  When this switch is on, estimates use the worse bound. Cost is higher. Capability is lower.
                </TooltipContent>
              </Tooltip>
            </div>
            <div>
              <ControlTitleHelp
                title="Weight presets"
                help="These buttons apply ready weight mixes for coding, speed, or budget ranking. Applying a preset unlocks all sliders."
              />
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(WEIGHT_PRESETS).map(([k, p]) => {
                  const isActive = displayPresetKey === k;
                  const isExact = matchedPresetKey === k;
                  return (
                    <Button
                      key={k}
                      size="xs"
                      variant={isActive ? "default" : "outline"}
                      className={isActive && !isExact ? "opacity-60" : undefined}
                      title={
                        isActive && !isExact
                          ? `${p.label} (modified — drag sliders, click again to reset)`
                          : `${p.label} (click to apply and unlock all sliders)`
                      }
                      onClick={() => applyPreset(k)}
                    >
                      {p.label}
                    </Button>
                  );
                })}
              </div>
              {(activePreset || matchedPresetKey) && !matchedPresetKey && activePreset && WEIGHT_PRESETS[activePreset] && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {WEIGHT_PRESETS[activePreset].label} modified
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 border-t border-border/40 pt-4">
            {(Object.keys(weights) as (keyof MetricWeights)[]).map((key) => {
              const meta = METRIC_HELP[key] ?? {
                label: key.replace("_", " "),
                help: `This slider sets how much ${key.replace("_", " ")} changes rank.`,
              };
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help items-center gap-1 border-b border-dotted border-muted-foreground/50 pb-0.5 font-medium text-foreground transition-colors hover:border-foreground">
                          <span>{meta.label}</span>
                          <CircleHelp className="size-3 text-muted-foreground/70" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                        {meta.help}
                      </TooltipContent>
                    </Tooltip>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {weights[key].toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[weights[key]]}
                    onValueChange={([v]) => setWeight(key, v)}
                  />
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-border/40 pt-4">
            <div className="space-y-1.5">
              <ControlTitleHelp
                title="Search"
                help="This box filters rows by name, organization, family, or task slug."
              />
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-7 text-xs"
                  placeholder="Search models…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <ControlTitleHelp
                title="Effort"
                help="This list filters variants by reasoning effort. Values include none, low, medium, high, xhigh, and max."
              />
              <Select value={effortFilter} onValueChange={setEffortFilter}>
                <SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder="Effort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All efforts</SelectItem>
                  {["none", "minimal", "low", "medium", "high", "xhigh", "max"].map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <ControlTitleHelp
                title="Provider filter"
                help="This list filters variants by inference provider or host."
              />
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder="Provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <ControlTitleHelp
                title="Sort by"
                help="This list sets the column that sorts the table."
              />
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-full h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {compareRows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5 shadow-xs">
          <div className="mb-2 text-sm font-semibold">Compare ({compareRows.length}/3)</div>
          <div className="grid gap-3 md:grid-cols-3">
            {compareRows.map((s) => (
              <div key={s.variant.canonicalId} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{s.variant.displayName}</div>
                <div className="mt-2 space-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                  <div>Effiq Score {fmtNum(s.efficiencyScore)} · Domain {fmtNum(s.domainScore)}</div>
                  <div>Task {fmtMoney(s.effectiveTaskCostUsd)} · Tokens {s.variant.metrics.taskTokens?.value != null ? fmtTokens(s.variant.metrics.taskTokens.value) : "—"} · Time {s.variant.metrics.taskTimeSeconds?.value != null ? `${s.variant.metrics.taskTimeSeconds.value.toFixed(1)}s` : "—"}</div>
                  <div>In {fmtPricePerM(s.variant.metrics.inputUsdPerMillion?.value)} · Out {fmtPricePerM(s.variant.metrics.outputUsdPerMillion?.value)}</div>
                  <div>Intel {fmtNum(s.intelligenceForGate)} · Coding {fmtNum(s.variant.metrics.coding?.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <React.Suspense
          fallback={
            <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
              Loading Effiq charts…
            </div>
          }
        >
          <ParetoScatter
            rows={sorted}
            xKey="effiq"
            yKey="taskCost"
            title="Task cost vs Effiq Score"
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <ParetoScatter
              rows={sorted}
              xKey="taskCost"
              yKey="domain"
              size="compact"
              title={
                channelFilter === "cursor"
                  ? "Capability vs task cost (CursorBench weighted)"
                  : "Capability vs task cost"
              }
            />
            <ParetoScatter
              rows={sorted}
              xKey="throughput"
              yKey="latency"
              size="compact"
              title="Latency vs throughput"
            />
          </div>
        </React.Suspense>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Provider</span>
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                channelFilter === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setChannelFilter("all")}
            >
              All Models
            </button>
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                channelFilter === "openrouter"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setChannelFilter("openrouter")}
            >
              OpenRouter
            </button>
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                channelFilter === "cursor"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setChannelFilter("cursor")}
            >
              Cursor Only ({cursorCount})
            </button>
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                channelFilter === "opencode"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setChannelFilter("opencode")}
            >
              OpenCode Go ({opencodeCount})
            </button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{sorted.length}</span> ranked models
          {channelFilter === "cursor" ? " with Cursor published plans" : ""}
          {channelFilter === "opencode" ? " with OpenCode Go published prices" : ""}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Model variant</TableHead>
              {columns.map((c) => (
                <TableHead key={c.key} className="cursor-pointer text-right" onClick={() => toggleSort(c.key)}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && (sortDir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />)}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={18} className="py-16 text-center text-muted-foreground">Loading Effiq rankings…</TableCell>
              </TableRow>
            )}
            {!loading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={18} className="py-16 text-center text-muted-foreground">
                  No variants match the current filters. Lower the intelligence floor or include approximations to view more models.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              sorted.slice(0, 250).map((s, i) => {
                const v = s.variant;
                const open = expanded === v.canonicalId;
                const parent = getModelParent(v);
                const lat =
                  v.metrics.latencyMs?.value ??
                  (v.metrics.ttftSeconds?.value != null ? v.metrics.ttftSeconds.value * 1000 : null);
                return (
                  <React.Fragment key={v.canonicalId}>
                    <TableRow
                      className="cursor-pointer"
                      data-state={selected.includes(v.canonicalId) ? "selected" : undefined}
                      onClick={() => setExpanded(open ? null : v.canonicalId)}
                    >
                      <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="rounded border px-1.5 text-[10px] hover:bg-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelect(v.canonicalId);
                            }}
                          >
                            {selected.includes(v.canonicalId) ? "Selected" : "Compare"}
                          </button>
                          <span
                            className="size-2 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: parent.color }}
                            title={`Parent: ${parent.label}`}
                          />
                          <span className="font-medium">{v.displayName}</span>
                          <Badge variant="outline" className="text-[10px]">{v.effort}</Badge>
                          {v.fast && <Badge variant="secondary" className="text-[10px]">fast</Badge>}
                          {isCursorVariant(v) && (
                            <Badge variant="secondary" className="border-primary/40 text-primary text-[10px]">
                              Cursor
                            </Badge>
                          )}
                          {isOpencodeVariant(v) && (
                            <Badge variant="secondary" className="text-[10px]">
                              OpenCode Go
                            </Badge>
                          )}
                          {statusBadge(v.metrics.intelligence?.status)}
                        </div>
                        {channelFilter === "cursor" ? (
                          <div className="font-mono text-[11px] text-foreground">
                            <span className="font-semibold text-primary">Cursor:</span>{" "}
                            <span>{v.ids.cursorTaskSlug || v.ids.cursorModelId}</span>
                            {(() => {
                              const co = v.offers.find((o) => o.channel === "cursor");
                              if (!co) return null;
                              return (
                                <span className="text-muted-foreground ml-1.5">
                                  · in ${co.inputUsdPerMillion?.toFixed(2) ?? "—"} / out ${co.outputUsdPerMillion?.toFixed(2) ?? "—"}
                                  {co.cacheReadUsdPerMillion != null ? ` · cache $${co.cacheReadUsdPerMillion.toFixed(2)}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {v.provider}
                            {v.ids.openrouterSlug ? ` · ${v.ids.openrouterSlug}` : ""}
                            {v.offers.length ? ` · ${v.offers.length} offers` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.efficiencyScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.domainEfficiencyScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.domainScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.intelligenceForGate} max={70} /></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(v.metrics.coding?.value)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(v.metrics.agentic?.value)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.metrics.cursorBench?.value != null ? (
                          <span className="font-semibold text-primary">{v.metrics.cursorBench.value.toFixed(1)}%</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="tabular-nums">{fmtMoney(s.effectiveTaskCostUsd)}</div>
                        <div className="flex justify-end">{statusBadge(s.taskCostStatus)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.metrics.taskTokens?.value != null ? fmtTokens(v.metrics.taskTokens.value) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.metrics.taskTimeSeconds?.value != null ? `${v.metrics.taskTimeSeconds.value.toFixed(1)}s` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.metrics.throughputTps?.value != null ? Math.round(v.metrics.throughputTps.value) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {lat != null ? (lat >= 1000 ? `${(lat / 1000).toFixed(1)}s` : `${Math.round(lat)}ms`) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                        {fmtPricePerM(v.metrics.inputUsdPerMillion?.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sky-600 dark:text-sky-400 font-mono text-[11px]">
                        {fmtPricePerM(v.metrics.outputUsdPerMillion?.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground font-mono text-[11px]">
                        {fmtPricePerM(v.metrics.cacheReadUsdPerMillion?.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(s.capabilityPerDollar, 1)}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={18} className="bg-muted/30 p-4 text-sm">
                          <div className="grid gap-4 lg:grid-cols-12">
                            <div className="lg:col-span-5 space-y-3">
                              <div className="font-semibold text-sm">Calculation & Score Breakdown</div>
                              <ul className="list-inside list-disc font-mono text-xs text-muted-foreground space-y-1">
                                {s.explanation.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                              <div className="space-y-1.5 pt-2 text-xs text-muted-foreground">
                                <div>
                                  Coverage {(v.evidenceCoverage * 100).toFixed(0)}% · Match confidence {(v.matchConfidence * 100).toFixed(0)}% · Overall {(s.confidence * 100).toFixed(0)}%
                                </div>
                                {v.metrics.taskTokens?.value != null && (
                                  <div className="font-mono text-foreground">
                                    Total tokens per task: <span className="font-semibold">{v.metrics.taskTokens.value.toLocaleString()}</span> ({v.metrics.taskTokens.status})
                                  </div>
                                )}
                                {v.metrics.taskTimeSeconds?.value != null && (
                                  <div className="font-mono text-foreground">
                                    Measured task completion time: <span className="font-semibold">{v.metrics.taskTimeSeconds.value.toFixed(2)}s</span> ({v.metrics.taskTimeSeconds.status})
                                  </div>
                                )}
                                {v.metrics.tokenHeaviness && (
                                  <div>
                                    Token heaviness ×{v.metrics.tokenHeaviness.value.toFixed(2)} ({v.metrics.tokenHeaviness.status})
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="lg:col-span-7 space-y-3">
                              <React.Suspense
                                fallback={
                                  <div className="text-xs text-muted-foreground">Loading model facts…</div>
                                }
                              >
                                {isCursorVariant(v) && (
                                  <CursorModelFacts variant={v} />
                                )}
                                {isOpencodeVariant(v) && (
                                  <OpenCodeGoModelFacts variant={v} />
                                )}
                                {(channelFilter !== "cursor" || !isCursorVariant(v) || v.ids.openrouterSlug) && (
                                  <OpenRouterModelFacts variant={v} />
                                )}
                              </React.Suspense>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        The default view keeps Artificial Analysis Intelligence at {DEFAULT_INTELLIGENCE_FLOOR} or higher.
        The table ranks models by the Effiq Score.
        The score compares capability against task cost, latency, and throughput.
        Approximated model variants have clear labels.
        Primary data sources are Artificial Analysis, OpenRouter, Cursor, and OpenCode Go.
      </p>
    </div>
    </TooltipProvider>
  );
}
