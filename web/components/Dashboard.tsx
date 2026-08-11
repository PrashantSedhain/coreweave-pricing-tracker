"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PriceChart from "./PriceChart";
import MultiLineChart from "./MultiLineChart";
import Sidebar from "./Sidebar";
import type { PricingSnapshot, ModelSeries, PricePoint } from "../types";
import type { DashboardData } from "../lib/data";
import { filterByDays, aggregateByWeek, aggregateByMonth } from "../lib/data-utils";

type TimeRange = "7d" | "30d" | "90d" | "all";

function getSeriesForModel(
  series: ModelSeries[],
  model: string,
  region: string
): ModelSeries | undefined {
  return series.find((s) => s.model === model && s.region === region);
}

function applyTimeRange(series: ModelSeries | undefined, range: TimeRange): ModelSeries | undefined {
  if (!series) return undefined;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
  const filtered = filterByDays(series, days);
  if (range === "all" && filtered.onDemand.length > 30) {
    return {
      ...filtered,
      onDemand: aggregateByWeek(filtered.onDemand),
      spot: aggregateByWeek(filtered.spot),
      inference: aggregateByWeek(filtered.inference),
    };
  }
  if (range === "90d" && filtered.onDemand.length > 20) {
    return {
      ...filtered,
      onDemand: aggregateByWeek(filtered.onDemand),
      spot: aggregateByWeek(filtered.spot),
      inference: aggregateByWeek(filtered.inference),
    };
  }
  if (range === "all" && filtered.onDemand.length > 90) {
    return {
      ...filtered,
      onDemand: aggregateByMonth(filtered.onDemand),
      spot: aggregateByMonth(filtered.spot),
      inference: aggregateByMonth(filtered.inference),
    };
  }
  return filtered;
}

function lastPrice(points: PricePoint[] | undefined): number | null {
  if (!points || points.length === 0) return null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].price !== null) return points[i].price;
  }
  return null;
}

function prevPrice(points: PricePoint[] | undefined): number | null {
  if (!points || points.length < 2) return null;
  let found = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].price !== null) {
      found++;
      if (found === 2) return points[i].price;
    }
  }
  return null;
}

function deltaStr(current: number | null, previous: number | null): { text: string; up: boolean; flat: boolean } {
  if (current === null || previous === null) return { text: "-", up: false, flat: true };
  const diff = current - previous;
  if (diff === 0) return { text: "0%", up: false, flat: true };
  const pct = ((diff / previous) * 100);
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${pct.toFixed(1)}%`, up: diff > 0, flat: false };
}

const GENERATIONS = [
  { key: "all", label: "All" },
  { key: "blackwell", label: "Blackwell", match: /GB300|GB200|HGX B300|HGX B200|RTX PRO/ },
  { key: "hopper", label: "Hopper", match: /HGX H100|HGX H200|GH200/ },
  { key: "ada", label: "Ada / Ampere", match: /L40|A100/ },
];

const CHART_PALETTE = [
  "#58a6ff", "#4ade80", "#f59e0b", "#fb923c", "#a78bfa",
  "#22d3ee", "#f87171", "#34d399", "#facc15", "#818cf8",
  "#f472b6", "#2dd4bf", "#e879f9", "#93c5fd", "#a3e635",
];

export default function Dashboard({ data }: { data: DashboardData }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabFromUrl = searchParams.get("tab") as "gpu" | "cpu" | "storage" | "networking" | null;
  const validTab = tabFromUrl && ["gpu", "cpu", "storage", "networking"].includes(tabFromUrl) ? tabFromUrl : "gpu";

  const [category, setCategory] = useState<"gpu" | "cpu" | "storage" | "networking">(validTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const changeTab = (cat: "gpu" | "cpu" | "storage" | "networking") => {
    setCategory(cat);
    setSelectedModel("__combined__");
    setSelectedCpuModel("__cpu_combined__");
    router.replace(`?tab=${cat}`, { scroll: false });
  };
  const [selectedModel, setSelectedModel] = useState<string | null>("__combined__");
  const [selectedCpuModel, setSelectedCpuModel] = useState<string | null>("__cpu_combined__");
  const [selectedStorageModel, setSelectedStorageModel] = useState<string | null>(null);
  const [selectedNetModel, setSelectedNetModel] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");
  const [cpuTimeRange, setCpuTimeRange] = useState<TimeRange>("all");
  const [storageTimeRange, setStorageTimeRange] = useState<TimeRange>("all");
  const [netTimeRange, setNetTimeRange] = useState<TimeRange>("all");
  const [genFilter, setGenFilter] = useState("all");
  const [combinedSelection, setCombinedSelection] = useState<Set<string>>(new Set());
  const [cpuCombinedSelection, setCpuCombinedSelection] = useState<Set<string>>(new Set());

  const { latest, gpuSeries, cpuSeries, storageSeries, networkingSeries, totalSnapshots } = data;

  const allGPUModels = useMemo(() => {
    const models = new Set<string>();
    for (const r of latest.regions) {
      for (const g of r.gpu) models.add(g.model);
    }
    return Array.from(models);
  }, [latest]);

  const contactOnlyModels = useMemo(() => {
    const priced = new Set<string>();
    for (const s of gpuSeries) {
      if (s.onDemand.some((p) => p.price !== null)) priced.add(s.model);
      if (s.spot.some((p) => p.price !== null)) priced.add(s.model);
    }
    return allGPUModels.filter((m) => !priced.has(m));
  }, [allGPUModels, gpuSeries]);

  const sortedModels = useMemo(() => {
    const priced = allGPUModels.filter((m) => !contactOnlyModels.includes(m));
    const contact = allGPUModels.filter((m) => contactOnlyModels.includes(m));
    return [...priced, ...contact];
  }, [allGPUModels, contactOnlyModels]);

  const gen = GENERATIONS.find((g) => g.key === genFilter)!;
  const filteredModels = useMemo(() => {
    const base = gen.key === "all" ? sortedModels : sortedModels.filter((m) => gen.match?.test(m));
    return base;
  }, [sortedModels, gen]);

  const showCombined = selectedModel === "__combined__";
  const showCpuCombined = selectedCpuModel === "__cpu_combined__";
  const displayModel = !showCombined
    ? (selectedModel && filteredModels.includes(selectedModel) ? selectedModel : filteredModels[0])
    : null;

  const gpuCount = allGPUModels.length;
  const cpuCount = useMemo(() => {
    const s = new Set<string>();
    for (const r of latest.regions) for (const c of r.cpu) s.add(c.model);
    return s.size;
  }, [latest]);

  const naSeries = displayModel ? getSeriesForModel(gpuSeries, displayModel, "North America") : undefined;
  const euSeries = displayModel ? getSeriesForModel(gpuSeries, displayModel, "Europe") : undefined;
  const naRanged = applyTimeRange(naSeries, timeRange);
  const euRanged = applyTimeRange(euSeries, timeRange);

  const naGpu = displayModel ? latest.regions.find((r) => r.name === "North America")?.gpu.find((g) => g.model === displayModel) : undefined;
  const euGpu = displayModel ? latest.regions.find((r) => r.name === "Europe")?.gpu.find((g) => g.model === displayModel) : undefined;

  const naOnDemand = lastPrice(naSeries?.onDemand);
  const naSpot = lastPrice(naSeries?.spot);
  const euOnDemand = lastPrice(euSeries?.onDemand);
  const euSpot = lastPrice(euSeries?.spot);

  const naOnDemandDelta = deltaStr(naOnDemand, prevPrice(naSeries?.onDemand));
  const naSpotDelta = deltaStr(naSpot, prevPrice(naSeries?.spot));
  const euOnDemandDelta = deltaStr(euOnDemand, prevPrice(euSeries?.onDemand));
  const euSpotDelta = deltaStr(euSpot, prevPrice(euSeries?.spot));

  const allCPUModelKeys = useMemo(() => {
    const keys = new Map<string, { model: string; cpuType: string }>();
    for (const r of latest.regions) {
      for (const c of r.cpu) {
        if (/^\$/.test(c.cpuType)) continue;
        if (/^contact/i.test(c.cpuType)) continue;
        const type = c.cpuType.replace(/[\(\)]/g, " ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
        const key = `${c.model}|${type}`;
        if (!keys.has(key)) keys.set(key, { model: c.model, cpuType: type });
      }
    }
    return Array.from(keys.values());
  }, [latest]);

  const displayCpuKey = selectedCpuModel || allCPUModelKeys[0]?.model + "|" + allCPUModelKeys[0]?.cpuType;
  const displayCpu = allCPUModelKeys.find((c) => c.model + "|" + c.cpuType === displayCpuKey);

  const naCpuSeries = displayCpu
    ? cpuSeries.find((s) => s.model === `${displayCpu.model} (${displayCpu.cpuType})` && s.region === "North America")
    : undefined;
  const euCpuSeries = displayCpu
    ? cpuSeries.find((s) => s.model === `${displayCpu.model} (${displayCpu.cpuType})` && s.region === "Europe")
    : undefined;
  const naCpuRanged = applyTimeRange(naCpuSeries, cpuTimeRange);
  const euCpuRanged = applyTimeRange(euCpuSeries, cpuTimeRange);

  const naCpu = displayCpu
    ? latest.regions.find((r) => r.name === "North America")?.cpu.find((c) => c.model === displayCpu.model && c.cpuType === displayCpu.cpuType)
    : undefined;
  const euCpu = displayCpu
    ? latest.regions.find((r) => r.name === "Europe")?.cpu.find((c) => c.model === displayCpu.model && c.cpuType === displayCpu.cpuType)
    : undefined;

  const naCpuOnDemand = lastPrice(naCpuSeries?.onDemand);
  const naCpuSpot = lastPrice(naCpuSeries?.spot);
  const euCpuOnDemand = lastPrice(euCpuSeries?.onDemand);
  const euCpuSpot = lastPrice(euCpuSeries?.spot);
  const naCpuODelta = deltaStr(naCpuOnDemand, prevPrice(naCpuSeries?.onDemand));
  const naCpuSDelta = deltaStr(naCpuSpot, prevPrice(naCpuSeries?.spot));
  const euCpuODelta = deltaStr(euCpuOnDemand, prevPrice(euCpuSeries?.onDemand));
  const euCpuSDelta = deltaStr(euCpuSpot, prevPrice(euCpuSeries?.spot));

  const storageTrends = useMemo(() => {
    const products = (latest.regions[0]?.storage || []).map((s) => ({
      ...s,
      changed: false,
      lastChange: null as string | null,
    }));
    if (data.totalSnapshots < 2) return products;
    for (const p of products) {
      const firstPrice = data.snapshots[0].regions[0]?.storage.find(
        (s: any) => s.product === p.product && s.tier === p.tier
      )?.price;
      if (firstPrice !== p.price) { p.changed = true; p.lastChange = data.snapshots[0].scrapeDate; }
    }
    return products;
  }, [latest, data]);

  const networkingTrends = useMemo(() => {
    const items = (latest.regions[0]?.networking || []).map((n) => ({
      ...n,
      changed: false,
    }));
    if (data.totalSnapshots < 2) return items;
    for (const n of items) {
      const firstPrice = data.snapshots[0].regions[0]?.networking.find(
        (x: any) => x.product === n.product
      )?.price;
      if (firstPrice !== n.price) n.changed = true;
    }
    return items;
  }, [latest, data]);

  const storageModelKeys = useMemo(() => {
    const models = new Set<string>();
    for (const s of storageSeries) models.add(s.model);
    return Array.from(models);
  }, [storageSeries]);

  const displayStorage = selectedStorageModel || storageModelKeys[0];
  const storageChartSeries = storageSeries.find((s) => s.model === displayStorage);
  const storageRanged = applyTimeRange(storageChartSeries, storageTimeRange);

  const netModelKeys = useMemo(() => {
    const models = new Set<string>();
    for (const n of networkingSeries) models.add(n.model);
    return Array.from(models);
  }, [networkingSeries]);

  const displayNet = selectedNetModel || netModelKeys[0];
  const netChartSeries = networkingSeries.find((n) => n.model === displayNet);
  const netRanged = applyTimeRange(netChartSeries, netTimeRange);

  return (
    <div className="flex flex-col md:flex-row min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Sidebar
        category={category}
        onChange={changeTab}
        gpuCount={gpuCount}
        cpuCount={cpuCount}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-auto w-full" style={{ minWidth: 0 }}>
        <header className="mb-4 sm:mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 rounded"
              style={{ color: "var(--text-dim)" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 4h16v2H2V4zm0 5h16v2H2V9zm0 5h16v2H2v-2z"/>
              </svg>
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                CoreWeave GPU Pricing
              </h1>
              <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm flex-wrap" style={{ color: "var(--text-dim)" }}>
                <span>{totalSnapshots} snapshots</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">
                  Updated{" "}
                  {new Date(latest.scrapedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          </div>
        </header>

        {category === "gpu" && (
          <>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {GENERATIONS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => { setGenFilter(g.key); setSelectedModel(null); }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors"
                  style={{
                    color: genFilter === g.key ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: genFilter === g.key ? "var(--accent-dim)" : "transparent",
                    borderColor: genFilter === g.key ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {filteredModels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                <button
                  onClick={() => setSelectedModel("__combined__")}
                  className="px-3 py-1.5 rounded text-sm font-semibold border transition-colors"
                  style={{
                    color: showCombined ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: showCombined ? "var(--accent-dim)" : "var(--bg-surface)",
                    borderColor: showCombined ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  All GPUs (combined)
                </button>
                <span className="self-center text-sm mx-1" style={{ color: "var(--text-muted)" }}>|</span>
                {filteredModels.map((m) => {
                  const isContact = contactOnlyModels.includes(m);
                  return (
                  <button
                    key={m}
                    onClick={() => setSelectedModel(m)}
                    className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
                    style={{
                      color: displayModel === m ? "var(--accent)" : isContact ? "var(--text-muted)" : "var(--text-dim)",
                      backgroundColor: displayModel === m ? "var(--accent-dim)" : "var(--bg-surface)",
                      borderColor: isContact ? "var(--border-color)" : displayModel === m ? "var(--accent-border)" : "var(--border-color)",
                      opacity: isContact && displayModel !== m ? 0.6 : 1,
                    }}
                  >
                    {m.replace("NVIDIA ", "")}
                    {isContact && <span className="ml-1 text-[10px] opacity-60">contact</span>}
                  </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 mb-5">
              {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className="px-3 py-1 rounded text-xs font-mono font-medium border transition-colors"
                  style={{
                    color: timeRange === r ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: timeRange === r ? "var(--accent-dim)" : "transparent",
                    borderColor: timeRange === r ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {showCombined && (
              <>
                <div className="flex flex-wrap gap-1.5 mb-4 items-center">
                  <span className="text-xs mr-1 whitespace-nowrap" style={{ color: "var(--text-dim)" }}>Show:</span>
                  <button
                    onClick={() => setCombinedSelection(new Set(filteredModels.filter((m) => !contactOnlyModels.includes(m))))}
                    className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                    style={{ color: "var(--text-dim)", borderColor: "var(--border-color)", backgroundColor: "transparent" }}
                  >
                    All priced
                  </button>
                  <button
                    onClick={() => setCombinedSelection(new Set())}
                    className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                    style={{ color: "var(--text-dim)", borderColor: "var(--border-color)", backgroundColor: "transparent" }}
                  >
                    None
                  </button>
                  {filteredModels.map((m) => {
                    const isContact = contactOnlyModels.includes(m);
                    const checked = (combinedSelection.size === 0 && !isContact) || combinedSelection.has(m);
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          const next = new Set(combinedSelection.size === 0 ? filteredModels : combinedSelection);
                          if (next.has(m)) { next.delete(m); } else { next.add(m); }
                          setCombinedSelection(next);
                        }}
                        className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                        style={{
                          color: checked ? "var(--accent)" : "var(--text-muted)",
                          borderColor: checked ? "var(--accent-border)" : "var(--border-color)",
                          backgroundColor: checked ? "var(--accent-dim)" : "transparent",
                          opacity: checked ? 1 : 0.5,
                        }}
                      >
                        {checked ? "✓" : "○"} {m.replace("NVIDIA ", "")}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
                  {(["North America", "Europe"] as const).map((region) => {
                    const allRegionSeries = gpuSeries.filter(
                      (s) => s.region === region && filteredModels.some((m) => m === s.model)
                    );
                    const selSet = combinedSelection.size === 0 ? new Set(filteredModels.filter((m) => !contactOnlyModels.includes(m))) : combinedSelection;
                    const regionSeries = allRegionSeries.filter((s) => selSet.has(s.model));
                    const rangedSeries = regionSeries
                      .map((s) => applyTimeRange(s, timeRange))
                      .filter(Boolean) as ModelSeries[];
                    const lines = rangedSeries.map((s, i) => ({
                      key: s.model.replace(/[^a-zA-Z0-9]/g, "_"),
                      label: s.model.replace("NVIDIA ", ""),
                      data: s.onDemand,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                    }));
                    const spotLines = rangedSeries
                      .filter((s) => s.spot.some((p) => p.price !== null))
                      .map((s, i) => ({
                        key: s.model.replace(/[^a-zA-Z0-9]/g, "_") + "_spot",
                        label: s.model.replace("NVIDIA ", ""),
                        data: s.spot,
                        color: CHART_PALETTE[i % CHART_PALETTE.length],
                      }));
                    return (
                      <div
                        key={region}
                        className="p-3 sm:p-5 rounded-lg"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
                      >
                        <h3 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--accent)" }}>
                          {region} — {lines.length} GPU{lines.length !== 1 ? "s" : ""}
                        </h3>
                        <div className="mb-3">
                          <div className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-dim)" }}>On-Demand</div>
                          <MultiLineChart lines={lines} height={280} showDots={rangedSeries.length > 0 && rangedSeries[0]?.onDemand.length < 15} />
                        </div>
                        {spotLines.length > 0 && (
                          <div>
                            <div className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-dim)" }}>Spot</div>
                            <MultiLineChart lines={spotLines} height={260} showDots={rangedSeries.length > 0 && rangedSeries[0]?.spot.length < 15} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!showCombined && displayModel && contactOnlyModels.includes(displayModel) && (
              <div
                className="flex items-start gap-3 px-5 py-4 rounded-lg mb-5 text-sm"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px dashed var(--border-color-strong)",
                  color: "var(--text-dim)",
                }}
              >
                <span style={{ fontSize: "1.3em", marginTop: 1 }}>&#8505;</span>
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{displayModel}</strong> is available only via{" "}
                  <strong style={{ color: "var(--accent)" }}>Contact Sales</strong>.
                  <br />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    CoreWeave does not publish on-demand, spot, or inference pricing for this GPU.
                    No price history data is available.
                  </span>
                </div>
              </div>
            )}

            {!showCombined && displayModel && !contactOnlyModels.includes(displayModel) && (
            <>
            <div
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-3 sm:mb-5 text-xs sm:text-sm flex-wrap"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
            >
              <span className="font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{displayModel}</span>
              <span className="hidden sm:inline" style={{ color: "var(--text-muted)" }}>·</span>
              <span className="whitespace-nowrap" style={{ color: "var(--text-dim)" }}>NA OnDem: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{naOnDemand !== null ? `$${naOnDemand.toFixed(2)}` : "Contact"}</span> <span className="font-mono" style={{ fontSize: 10, color: naOnDemandDelta.up ? "var(--danger)" : naOnDemandDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{naOnDemandDelta.text}</span></span>
              <span className="whitespace-nowrap" style={{ color: "var(--text-dim)" }}>NA Spot: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{naSpot !== null ? `$${naSpot.toFixed(2)}` : "N/A"}</span> <span className="font-mono" style={{ fontSize: 10, color: naSpotDelta.up ? "var(--danger)" : naSpotDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{naSpotDelta.text}</span></span>
              <span className="hidden sm:inline" style={{ color: "var(--text-muted)" }}>·</span>
              <span className="whitespace-nowrap" style={{ color: "var(--text-dim)" }}>EU OnDem: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{euOnDemand !== null ? `$${euOnDemand.toFixed(2)}` : "Contact"}</span> <span className="font-mono" style={{ fontSize: 10, color: euOnDemandDelta.up ? "var(--danger)" : euOnDemandDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{euOnDemandDelta.text}</span></span>
              <span className="whitespace-nowrap" style={{ color: "var(--text-dim)" }}>EU Spot: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{euSpot !== null ? `$${euSpot.toFixed(2)}` : "N/A"}</span> <span className="font-mono" style={{ fontSize: 10, color: euSpotDelta.up ? "var(--danger)" : euSpotDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{euSpotDelta.text}</span></span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
              {([
                { label: "North America", series: naRanged, gpu: naGpu },
                { label: "Europe", series: euRanged, gpu: euGpu },
              ] as const).map(({ label, series, gpu }) => (
                <div
                  key={label}
                  className="p-3 sm:p-5 rounded-lg"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
                >
                  <h3
                    className="text-sm font-semibold uppercase tracking-wide mb-3"
                    style={{ color: "var(--accent)" }}
                  >
                    {label}
                  </h3>
                  <div className="space-y-4">
                    {series?.onDemand.filter((p) => p.price !== null).length! > 0 && (
                      <div>
                        <div
                          className="flex items-center justify-between mb-1"
                          style={{ color: "var(--text-dim)" }}
                        >
                          <span className="text-xs uppercase tracking-wide font-medium">On-Demand</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                            {gpu?.onDemandPrice !== null ? `$${gpu!.onDemandPrice.toFixed(2)}` : "Contact"}
                          </span>
                        </div>
                        <PriceChart data={series!.onDemand} height={180} showDots={series!.onDemand.length < 15} />
                      </div>
                    )}
                    {series?.spot.filter((p) => p.price !== null).length! > 0 && (
                      <div>
                        <div
                          className="flex items-center justify-between mb-1"
                          style={{ color: "var(--text-dim)" }}
                        >
                          <span className="text-xs uppercase tracking-wide font-medium">Spot</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                            {gpu?.spotPrice !== null ? `$${gpu!.spotPrice.toFixed(2)}` : "N/A"}
                          </span>
                        </div>
                        <PriceChart
                          data={series!.spot}
                          color="#f59e0b"
                          height={180}
                          showDots={series!.spot.length < 15}
                        />
                      </div>
                    )}
                    {series?.inference.filter((p) => p.price !== null).length! > 0 && (
                      <div>
                        <div
                          className="flex items-center justify-between mb-1"
                          style={{ color: "var(--text-dim)" }}
                        >
                          <span className="text-xs uppercase tracking-wide font-medium">Inference</span>
                          <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                            {gpu?.inferencePrice !== null ? `$${gpu!.inferencePrice.toFixed(2)}` : "N/A"}
                          </span>
                        </div>
                        <PriceChart
                          data={series!.inference}
                          color="#a78bfa"
                          height={180}
                          showDots={series!.inference.length < 15}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>)
            }

            {!showCombined && (
            <div
              className="rounded-lg overflow-hidden"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Region</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>GPUs</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>VRAM</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>vCPUs</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>RAM</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Storage</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>On-Demand</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Spot</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Inference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.regions.map((region) => {
                      const gpu = region.gpu.find((g) => g.model === displayModel);
                      if (!gpu) return null;
                      return (
                        <tr key={region.name} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{region.name}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{gpu.gpuCount}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{gpu.vramGB} GB</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm hidden sm:table-cell" style={{ color: "var(--text-dim)" }}>{gpu.vcpus}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{gpu.systemRAMGB} GB</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm hidden sm:table-cell" style={{ color: "var(--text-dim)" }}>{gpu.localStorageTB} TB</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right font-mono font-semibold" style={{ color: gpu.onDemandPrice !== null ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {gpu.onDemandPrice !== null ? `$${gpu.onDemandPrice.toFixed(2)}` : "Contact"}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right font-mono font-semibold" style={{ color: gpu.spotPrice !== null ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {gpu.spotPrice !== null ? `$${gpu.spotPrice.toFixed(2)}` : "N/A"}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-right font-mono font-semibold" style={{ color: gpu.inferencePrice !== null ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {gpu.inferencePrice !== null ? `$${gpu.inferencePrice.toFixed(2)}` : "N/A"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}

        {category === "cpu" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              CoreWeave CPU Pricing
            </h1>

            {allCPUModelKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => { setSelectedCpuModel("__cpu_combined__"); setCpuCombinedSelection(new Set(allCPUModelKeys.map((c) => c.model + "|" + c.cpuType))); }}
                  className="px-3 py-1.5 rounded text-sm font-semibold border transition-colors"
                  style={{
                    color: showCpuCombined ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: showCpuCombined ? "var(--accent-dim)" : "var(--bg-surface)",
                    borderColor: showCpuCombined ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  All CPUs (combined)
                </button>
                <span className="self-center text-sm mx-1" style={{ color: "var(--text-muted)" }}>|</span>
                {allCPUModelKeys.map((c) => {
                  const key = c.model + "|" + c.cpuType;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCpuModel(key)}
                      className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
                      style={{
                        color: !showCpuCombined && displayCpuKey === key ? "var(--accent)" : "var(--text-dim)",
                        backgroundColor: !showCpuCombined && displayCpuKey === key ? "var(--accent-dim)" : "var(--bg-surface)",
                        borderColor: !showCpuCombined && displayCpuKey === key ? "var(--accent-border)" : "var(--border-color)",
                      }}
                    >
                      {c.model} <span style={{ color: "var(--text-muted)" }}>·</span> {c.cpuType}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setCpuTimeRange(r)}
                  className="px-3 py-1 rounded text-xs font-mono font-medium border transition-colors"
                  style={{
                    color: cpuTimeRange === r ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: cpuTimeRange === r ? "var(--accent-dim)" : "transparent",
                    borderColor: cpuTimeRange === r ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {showCpuCombined && (
              <div className="flex flex-wrap gap-1.5 mb-4 items-center">
                <span className="text-xs mr-1 whitespace-nowrap" style={{ color: "var(--text-dim)" }}>Show:</span>
                <button
                  onClick={() => setCpuCombinedSelection(new Set(allCPUModelKeys.map((c) => c.model + "|" + c.cpuType)))}
                  className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                  style={{ color: "var(--text-dim)", borderColor: "var(--border-color)", backgroundColor: "transparent" }}
                >
                  All
                </button>
                <button
                  onClick={() => setCpuCombinedSelection(new Set())}
                  className="px-2 py-1 rounded text-[11px] sm:text-xs font-medium border transition-colors"
                  style={{ color: "var(--text-dim)", borderColor: "var(--border-color)", backgroundColor: "transparent" }}
                >
                  None
                </button>
                {allCPUModelKeys.map((c) => {
                  const key = c.model + "|" + c.cpuType;
                  const allKeys = allCPUModelKeys.map((x) => x.model + "|" + x.cpuType);
                  const checked = cpuCombinedSelection.size === 0 || cpuCombinedSelection.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const next = new Set(cpuCombinedSelection.size === 0 ? allKeys : cpuCombinedSelection);
                        if (next.has(key)) { next.delete(key); } else { next.add(key); }
                        setCpuCombinedSelection(next);
                      }}
                      className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                      style={{
                        color: checked ? "var(--accent)" : "var(--text-muted)",
                        borderColor: checked ? "var(--accent-border)" : "var(--border-color)",
                        backgroundColor: checked ? "var(--accent-dim)" : "transparent",
                        opacity: checked ? 1 : 0.5,
                      }}
                    >
                      {checked ? "✓" : "○"} {c.model} ({c.cpuType})
                    </button>
                  );
                })}
              </div>
            )}

            {showCpuCombined && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
                {(["North America", "Europe"] as const).map((region) => {
                  const allRegionSeries = cpuSeries.filter(
                    (s) => s.region === region && allCPUModelKeys.some((c) => s.model === `${c.model} (${c.cpuType})`)
                  );
                  const selSet = cpuCombinedSelection.size === 0 ? new Set(allCPUModelKeys.map((c) => c.model + "|" + c.cpuType)) : cpuCombinedSelection;
                  const regionSeries = allRegionSeries.filter((s) =>
                    allCPUModelKeys.some((c) => s.model === `${c.model} (${c.cpuType})` && selSet.has(c.model + "|" + c.cpuType))
                  );
                  const rangedSeries = regionSeries
                    .map((s) => applyTimeRange(s, cpuTimeRange))
                    .filter(Boolean) as ModelSeries[];
                  const lines = rangedSeries.map((s, i) => ({
                    key: s.model.replace(/[^a-zA-Z0-9]/g, "_"),
                    label: s.model,
                    data: s.onDemand,
                    color: CHART_PALETTE[i % CHART_PALETTE.length],
                  }));
                  const spotLines = rangedSeries
                    .filter((s) => s.spot.some((p) => p.price !== null))
                    .map((s, i) => ({
                      key: s.model.replace(/[^a-zA-Z0-9]/g, "_") + "_spot",
                      label: s.model,
                      data: s.spot,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                    }));
                  return (
                    <div
                      key={region}
                      className="p-3 sm:p-5 rounded-lg"
                      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
                    >
                      <h3 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--accent)" }}>
                        {region} — {lines.length} CPU{lines.length !== 1 ? "s" : ""}
                      </h3>
                      <div className="mb-3">
                        <div className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-dim)" }}>On-Demand</div>
                        <MultiLineChart lines={lines} height={280} showDots={rangedSeries.length > 0 && rangedSeries[0]?.onDemand.length < 15} />
                      </div>
                      {spotLines.length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--text-dim)" }}>Spot</div>
                          <MultiLineChart lines={spotLines} height={260} showDots={rangedSeries.length > 0 && rangedSeries[0]?.spot.length < 15} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!showCpuCombined && displayCpu && (
            <>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm flex-wrap"
                style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
              >
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{displayCpu.model} ({displayCpu.cpuType})</span>
                <span style={{ color: "var(--text-dim)" }}>NA OnDem: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{naCpuOnDemand !== null ? `$${naCpuOnDemand.toFixed(2)}` : "Contact"}</span> <span className="font-mono text-xs" style={{ color: naCpuODelta.up ? "var(--danger)" : naCpuODelta.flat ? "var(--text-muted)" : "var(--success)" }}>{naCpuODelta.text}</span></span>
                <span style={{ color: "var(--text-dim)" }}>NA Spot: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{naCpuSpot !== null ? `$${naCpuSpot.toFixed(2)}` : "N/A"}</span> <span className="font-mono text-xs" style={{ color: naCpuSDelta.up ? "var(--danger)" : naCpuSDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{naCpuSDelta.text}</span></span>
                <span style={{ color: "var(--text-muted)" }}>·</span>
                <span style={{ color: "var(--text-dim)" }}>EU OnDem: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{euCpuOnDemand !== null ? `$${euCpuOnDemand.toFixed(2)}` : "Contact"}</span> <span className="font-mono text-xs" style={{ color: euCpuODelta.up ? "var(--danger)" : euCpuODelta.flat ? "var(--text-muted)" : "var(--success)" }}>{euCpuODelta.text}</span></span>
                <span style={{ color: "var(--text-dim)" }}>EU Spot: <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{euCpuSpot !== null ? `$${euCpuSpot.toFixed(2)}` : "N/A"}</span> <span className="font-mono text-xs" style={{ color: euCpuSDelta.up ? "var(--danger)" : euCpuSDelta.flat ? "var(--text-muted)" : "var(--success)" }}>{euCpuSDelta.text}</span></span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
                {([
                  { label: "North America", series: naCpuRanged, item: naCpu },
                  { label: "Europe", series: euCpuRanged, item: euCpu },
                ] as const).map(({ label, series, item }) => (
                  <div
                    key={label}
                    className="p-3 sm:p-5 rounded-lg"
                    style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}
                  >
                    <h3
                      className="text-sm font-semibold uppercase tracking-wide mb-3"
                      style={{ color: "var(--accent)" }}
                    >
                      {label}
                    </h3>
                    <div className="space-y-4">
                      {series?.onDemand.filter((p) => p.price !== null).length! > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1" style={{ color: "var(--text-dim)" }}>
                            <span className="text-xs uppercase tracking-wide font-medium">On-Demand</span>
                            <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                              {item?.onDemandPrice !== null ? `$${item!.onDemandPrice.toFixed(2)}` : "Contact"}
                            </span>
                          </div>
                        <PriceChart data={series!.onDemand} height={180} showDots={series!.onDemand.length < 15} />
                        </div>
                      )}
                      {series?.spot.filter((p) => p.price !== null).length! > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-1" style={{ color: "var(--text-dim)" }}>
                            <span className="text-xs uppercase tracking-wide font-medium">Spot</span>
                            <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                              {item?.spotPrice !== null ? `$${item!.spotPrice.toFixed(2)}` : "N/A"}
                            </span>
                          </div>
                          <PriceChart data={series!.spot} color="#f59e0b" height={180} showDots={series!.spot.length < 15} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>)
            }

            {!showCpuCombined && (
            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Region</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Model</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Type</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>vCPUs</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>RAM</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs uppercase tracking-wide font-medium hidden sm:table-cell" style={{ color: "var(--text-muted)" }}>Storage</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>On-Demand</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Spot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.regions.flatMap((region) =>
                      region.cpu.map((cpu) => (
                        <tr key={`${region.name}-${cpu.model}-${cpu.cpuType}`} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{region.name}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{cpu.model}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{cpu.cpuType}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm hidden sm:table-cell" style={{ color: "var(--text-dim)" }}>{cpu.vcpus}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm" style={{ color: "var(--text-dim)" }}>{cpu.systemRAMGB} GB</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm hidden sm:table-cell" style={{ color: "var(--text-dim)" }}>{cpu.localStorageTB} TB</td>
                          <td className="px-4 py-3 text-sm text-right font-mono font-semibold" style={{ color: cpu.onDemandPrice !== null ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {cpu.onDemandPrice !== null ? `$${cpu.onDemandPrice.toFixed(2)}` : "Contact"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono font-semibold" style={{ color: cpu.spotPrice !== null ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {cpu.spotPrice !== null ? `$${cpu.spotPrice.toFixed(2)}` : "N/A"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </>
        )}

        {category === "storage" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              CoreWeave Storage Pricing
            </h1>

            {storageModelKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {storageModelKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedStorageModel(key)}
                    className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
                    style={{
                      color: displayStorage === key ? "var(--accent)" : "var(--text-dim)",
                      backgroundColor: displayStorage === key ? "var(--accent-dim)" : "var(--bg-surface)",
                      borderColor: displayStorage === key ? "var(--accent-border)" : "var(--border-color)",
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setStorageTimeRange(r)}
                  className="px-3 py-1 rounded text-xs font-mono font-medium border transition-colors"
                  style={{
                    color: storageTimeRange === r ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: storageTimeRange === r ? "var(--accent-dim)" : "transparent",
                    borderColor: storageTimeRange === r ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {storageChartSeries && (
              <div className="grid grid-cols-1 gap-3 sm:gap-5 mb-3 sm:mb-5">
                <div className="p-3 sm:p-5 rounded-lg" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--accent)" }}>
                    {displayStorage}
                  </h3>
                  <div className="max-w-2xl">
                    <div className="flex items-center justify-between mb-1" style={{ color: "var(--text-dim)" }}>
                      <span className="text-xs uppercase tracking-wide font-medium">Price per GB/month</span>
                      <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                        {lastPrice(storageChartSeries.onDemand) !== null
                          ? `$${lastPrice(storageChartSeries.onDemand)!.toFixed(4)}`
                          : "N/A"}
                      </span>
                    </div>
                    <PriceChart data={storageChartSeries.onDemand} height={220} showDots={storageRanged!.onDemand.length < 15} />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Tier</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Price</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageTrends.map((s) => (
                      <tr key={`${s.product}-${s.tier}`} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td className="px-4 py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.product}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--text-dim)" }}>{s.tier}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                          {s.price !== null ? `$${s.price.toFixed(4)}/GB/mo` : "N/A"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {data.totalSnapshots < 2 ? (
                            <span style={{ color: "var(--text-muted)" }}>Need more data</span>
                          ) : s.changed ? (
                            <span style={{ color: "var(--danger)" }}>Changed</span>
                          ) : (
                            <span style={{ color: "var(--success)" }}>Unchanged</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {category === "networking" && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              CoreWeave Networking Pricing
            </h1>

            {netModelKeys.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {netModelKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedNetModel(key)}
                    className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
                    style={{
                      color: displayNet === key ? "var(--accent)" : "var(--text-dim)",
                      backgroundColor: displayNet === key ? "var(--accent-dim)" : "var(--bg-surface)",
                      borderColor: displayNet === key ? "var(--accent-border)" : "var(--border-color)",
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mb-4">
              {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setNetTimeRange(r)}
                  className="px-3 py-1 rounded text-xs font-mono font-medium border transition-colors"
                  style={{
                    color: netTimeRange === r ? "var(--accent)" : "var(--text-dim)",
                    backgroundColor: netTimeRange === r ? "var(--accent-dim)" : "transparent",
                    borderColor: netTimeRange === r ? "var(--accent-border)" : "var(--border-color)",
                  }}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>

            {netChartSeries && (
              <div className="grid grid-cols-1 gap-3 sm:gap-5 mb-3 sm:mb-5">
                <div className="p-3 sm:p-5 rounded-lg" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--accent)" }}>
                    {displayNet}
                  </h3>
                  <div className="max-w-2xl">
                    <div className="flex items-center justify-between mb-1" style={{ color: "var(--text-dim)" }}>
                      <span className="text-xs uppercase tracking-wide font-medium">Monthly Price</span>
                      <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                        {lastPrice(netChartSeries.onDemand) !== null
                          ? `$${lastPrice(netChartSeries.onDemand)!.toLocaleString()}`
                          : "Free"}
                      </span>
                    </div>
                    <PriceChart data={netChartSeries.onDemand} height={220} showDots={netRanged!.onDemand.length < 15} />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-color)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                      <th className="px-4 py-3 text-left text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Details</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Price</th>
                      <th className="px-4 py-3 text-right text-xs uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkingTrends.map((n) => (
                      <tr key={n.product} style={{ borderBottom: "1px solid var(--border-color)" }}>
                        <td className="px-4 py-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{n.product}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: "var(--text-dim)" }}>{n.details || "-"}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                          {n.price !== null ? `$${n.price.toLocaleString()}` : "Free"}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {data.totalSnapshots < 2 ? (
                            <span style={{ color: "var(--text-muted)" }}>Need more data</span>
                          ) : n.changed ? (
                            <span style={{ color: "var(--danger)" }}>Changed</span>
                          ) : (
                            <span style={{ color: "var(--success)" }}>Unchanged</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
