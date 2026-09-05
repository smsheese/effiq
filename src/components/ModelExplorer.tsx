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
  ModelsMatrix,
  ScoredVariant,
  UsageProfileId,
} from "@/lib/schema";
import {
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ParetoScatter } from "@/components/ParetoScatter";

type SortKey =
  | "efficiency"
  | "domainEfficiency"
  | "domain"
  | "capabilityPerDollar"
  | "intelligence"
  | "coding"
  | "agentic"
  | "taskCost"
  | "throughput"
  | "latency"
  | "name";

const STORAGE_KEY = "effiq-v1";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.001) return `$${n.toExponential(1)}`;
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

export function ModelExplorer() {
  const [matrix, setMatrix] = React.useState<ModelsMatrix | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showControls, setShowControls] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [profileId, setProfileId] = React.useState<UsageProfileId>("general");
  const [weights, setWeights] = React.useState<MetricWeights>(DEFAULT_EFFICIENCY_WEIGHTS);
  const [intelFloor, setIntelFloor] = React.useState(DEFAULT_INTELLIGENCE_FLOOR);
  const [includeApprox, setIncludeApprox] = React.useState(true);
  const [minConfidence, setMinConfidence] = React.useState(0.3);
  const [conservative, setConservative] = React.useState(true);
  const [effortFilter, setEffortFilter] = React.useState<string>("all");
  const [providerFilter, setProviderFilter] = React.useState<string>("all");
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          weights?: MetricWeights;
          profileId?: UsageProfileId;
          intelFloor?: number;
        };
        if (saved.weights) setWeights(normalizeWeights(saved.weights));
        if (saved.profileId && !params.get("profile")) setProfileId(saved.profileId);
        if (saved.intelFloor != null && !params.get("intel")) setIntelFloor(saved.intelFloor);
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ weights, profileId, intelFloor }),
    );
    const params = new URLSearchParams(window.location.search);
    params.set("profile", profileId);
    params.set("intel", String(intelFloor));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [weights, profileId, intelFloor]);

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
  };

  const options: RankingOptions = React.useMemo(
    () => ({
      profileId,
      weights: normalizeWeights(weights),
      intelligenceFloor: intelFloor,
      includeApproximations: includeApprox,
      minConfidence,
      conservativeRanking: conservative,
    }),
    [profileId, weights, intelFloor, includeApprox, minConfidence, conservative],
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

  const filtered = React.useMemo(() => {
    const qq = q.trim().toLowerCase();
    return scored.filter((s) => {
      if (qq) {
        const hay = `${s.variant.displayName} ${s.variant.familySlug} ${s.variant.provider} ${s.variant.ids.openrouterSlug ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (effortFilter !== "all" && s.variant.effort !== effortFilter) return false;
      if (providerFilter !== "all" && s.variant.provider !== providerFilter) return false;
      return true;
    });
  }, [scored, q, effortFilter, providerFilter]);

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
        case "taskCost":
          return s.effectiveTaskCostUsd;
        case "throughput":
          return s.variant.metrics.throughputTps?.value ?? null;
        case "latency":
          return s.variant.metrics.latencyMs?.value ?? (s.variant.metrics.ttftSeconds?.value != null ? s.variant.metrics.ttftSeconds.value * 1000 : null);
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
    const bestEff = sorted[0];
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
      setSortDir(key === "taskCost" || key === "latency" || key === "name" ? "asc" : "desc");
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
      efficiency: s.efficiencyScore,
      domain: s.domainScore,
      taskCost: s.effectiveTaskCostUsd,
      intelligence: s.intelligenceForGate,
      profile: profileId,
    })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `efficiency-${profileId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setWeight = (key: keyof MetricWeights, value: number) => {
    setWeights((w) => normalizeWeights({ ...w, [key]: value }));
  };

  const profile = getProfile(profileId);
  const compareRows = sorted.filter((s) => selected.includes(s.variant.canonicalId));

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "efficiency", label: "Eff. score" },
    { key: "domainEfficiency", label: "Domain eff." },
    { key: "domain", label: "Domain" },
    { key: "intelligence", label: "Intel" },
    { key: "coding", label: "Coding" },
    { key: "agentic", label: "Agentic" },
    { key: "taskCost", label: "Task $" },
    { key: "throughput", label: "TPS" },
    { key: "latency", label: "Latency" },
    { key: "capabilityPerDollar", label: "Cap/$" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Best efficiency", row: leaders.bestEff, fmt: (s: ScoredVariant) => fmtNum(s.efficiencyScore) },
          { label: "Lowest task cost", row: leaders.cheapest, fmt: (s: ScoredVariant) => fmtMoney(s.effectiveTaskCostUsd) },
          { label: "Highest intelligence", row: leaders.smartest, fmt: (s: ScoredVariant) => fmtNum(s.intelligenceForGate) },
          { label: "Fastest output", row: leaders.fastest, fmt: (s: ScoredVariant) => s.variant.metrics.throughputTps?.value != null ? `${Math.round(s.variant.metrics.throughputTps.value)} t/s` : "—" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</div>
            <div className="mt-1 truncate font-semibold">{card.row?.variant.displayName ?? "—"}</div>
            <div className="mt-1 font-mono text-sm tabular-nums text-primary">
              {card.row ? card.fmt(card.row) : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</span>
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
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        {profile.description} Workload: <span className="text-foreground">{profile.workload.label}</span>.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant={showControls ? "secondary" : "outline"} size="sm" onClick={() => setShowControls(!showControls)}>
          <SlidersHorizontal /> Ranking controls
        </Button>
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
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load matrix: {error}
        </div>
      )}

      {showControls && (
        <div className="mb-5 space-y-4 rounded-xl border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Min intelligence ({intelFloor})
              </label>
              <Slider
                min={0}
                max={70}
                step={1}
                value={[intelFloor]}
                onValueChange={([v]) => setIntelFloor(v)}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Min confidence ({minConfidence.toFixed(2)})
              </label>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[minConfidence]}
                onValueChange={([v]) => setMinConfidence(v)}
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={includeApprox} onCheckedChange={setIncludeApprox} /> Include approximations
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={conservative} onCheckedChange={setConservative} /> Conservative ranking bounds
              </label>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weight presets</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(WEIGHT_PRESETS).map(([k, p]) => (
                  <Button key={k} size="xs" variant="outline" onClick={() => setWeights(normalizeWeights(p.weights))}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(weights) as (keyof MetricWeights)[]).map((key) => (
              <div key={key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium capitalize">{key.replace("_", " ")}</span>
                  <span className="tabular-nums text-muted-foreground">{weights[key].toFixed(0)}%</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[weights[key]]}
                  onValueChange={([v]) => setWeight(key, v)}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-7" placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={effortFilter} onValueChange={setEffortFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Effort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All efforts</SelectItem>
                {["none", "minimal", "low", "medium", "high", "xhigh", "max"].map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {compareRows.length > 0 && (
        <div className="mb-5 overflow-x-auto rounded-xl border bg-card p-4">
          <div className="mb-2 text-sm font-semibold">Compare ({compareRows.length}/3)</div>
          <div className="grid gap-3 md:grid-cols-3">
            {compareRows.map((s) => (
              <div key={s.variant.canonicalId} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{s.variant.displayName}</div>
                <div className="mt-2 space-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                  <div>Eff {fmtNum(s.efficiencyScore)} · Domain {fmtNum(s.domainScore)}</div>
                  <div>Task {fmtMoney(s.effectiveTaskCostUsd)} · Intel {fmtNum(s.intelligenceForGate)}</div>
                  <div>Coding {fmtNum(s.variant.metrics.coding?.value)} · Agentic {fmtNum(s.variant.metrics.agentic?.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        <ParetoScatter rows={sorted} xKey="taskCost" yKey="domain" title="Capability vs task cost" />
        <ParetoScatter rows={sorted} xKey="latency" yKey="throughput" title="Throughput vs latency" />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
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
                <TableCell colSpan={12} className="py-16 text-center text-muted-foreground">Loading efficiency matrix…</TableCell>
              </TableRow>
            )}
            {!loading && sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-16 text-center text-muted-foreground">
                  No variants match. Try lowering the intelligence floor or including approximations.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              sorted.slice(0, 250).map((s, i) => {
                const v = s.variant;
                const open = expanded === v.canonicalId;
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
                          <span className="font-medium">{v.displayName}</span>
                          <Badge variant="outline" className="text-[10px]">{v.effort}</Badge>
                          {v.fast && <Badge variant="secondary" className="text-[10px]">fast</Badge>}
                          {statusBadge(v.metrics.intelligence?.status)}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {v.provider}
                          {v.ids.openrouterSlug ? ` · ${v.ids.openrouterSlug}` : ""}
                          {v.offers.length ? ` · ${v.offers.length} offers` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.efficiencyScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.domainEfficiencyScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.domainScore} /></TableCell>
                      <TableCell className="text-right"><ScoreBar value={s.intelligenceForGate} max={70} /></TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(v.metrics.coding?.value)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(v.metrics.agentic?.value)}</TableCell>
                      <TableCell className="text-right">
                        <div className="tabular-nums">{fmtMoney(s.effectiveTaskCostUsd)}</div>
                        <div className="flex justify-end">{statusBadge(s.taskCostStatus)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.metrics.throughputTps?.value != null ? Math.round(v.metrics.throughputTps.value) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {lat != null ? (lat >= 1000 ? `${(lat / 1000).toFixed(1)}s` : `${Math.round(lat)}ms`) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(s.capabilityPerDollar, 1)}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={12} className="bg-muted/30 text-sm">
                          <div className="grid gap-3 p-2 md:grid-cols-2">
                            <div>
                              <div className="mb-1 font-semibold">Score explanation</div>
                              <ul className="list-inside list-disc font-mono text-xs text-muted-foreground">
                                {s.explanation.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                              <div className="mt-2 text-xs text-muted-foreground">
                                Coverage {(v.evidenceCoverage * 100).toFixed(0)}% · Match confidence {(v.matchConfidence * 100).toFixed(0)}% · Overall {(s.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 font-semibold">Offers & pricing</div>
                              <div className="space-y-1 text-xs">
                                {v.offers.slice(0, 6).map((o) => (
                                  <div key={o.id} className="flex justify-between gap-2 font-mono">
                                    <span>{o.channel}/{o.provider}</span>
                                    <span>
                                      in ${o.inputUsdPerMillion?.toFixed(2) ?? "—"} / out ${o.outputUsdPerMillion?.toFixed(2) ?? "—"}
                                    </span>
                                  </div>
                                ))}
                                {!v.offers.length && <div className="text-muted-foreground">No provider offers attached.</div>}
                              </div>
                              {v.metrics.tokenHeaviness && (
                                <div className="mt-2 text-xs">
                                  Token heaviness ×{v.metrics.tokenHeaviness.value.toFixed(2)} ({v.metrics.tokenHeaviness.status})
                                </div>
                              )}
                              {v.ids.openrouterSlug && (
                                <a
                                  className="mt-2 inline-block text-xs text-primary underline underline-offset-2"
                                  href={`https://openrouter.ai/${v.ids.openrouterSlug}`}
                                  target="_blank"
                                  rel="noopener"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open on OpenRouter
                                </a>
                              )}
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

      <p className="mt-4 max-w-4xl text-xs leading-relaxed text-muted-foreground">
        Default view keeps Artificial Analysis Intelligence ≥ {DEFAULT_INTELLIGENCE_FLOOR} and ranks by a transparent Efficiency Score
        (capability vs measured/estimated task cost, latency, and throughput). Approximated reasoning variants are labeled.
        Primary sources: Artificial Analysis, OpenRouter, Cursor. Usage profiles change domain evidence, weights, and workload cost assumptions.
      </p>
    </div>
  );
}
