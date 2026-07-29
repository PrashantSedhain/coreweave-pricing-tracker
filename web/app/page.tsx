"use client";

import { useEffect, useState, useMemo } from "react";
import PriceChart from "../components/PriceChart";
import RegionSelector from "../components/RegionSelector";
import ChangeIndicator from "../components/ChangeIndicator";
import type {
  PricingSnapshot,
  ModelSeries,
  GPUPricing,
  CPUPricing,
  StoragePricing,
  NetworkingPricing,
} from "../types";

interface DashboardData {
  latest: PricingSnapshot | null;
  gpuSeries: ModelSeries[];
  cpuSeries: ModelSeries[];
  totalSnapshots: number;
}

const GPU_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

function getSeriesForModel(
  series: ModelSeries[],
  model: string,
  region: string
): ModelSeries | undefined {
  return series.find((s) => s.model === model && s.region === region);
}

function getPreviousSnapshotPrice(
  latest: PricingSnapshot | null,
  model: string,
  regionName: string,
  priceType: "onDemand" | "spot"
): number | null {
  if (!latest) return null;
  const region = latest.regions.find((r) => r.name === regionName);
  if (!region) return null;
  const gpu = region.gpu.find((g) => g.model === model);
  if (!gpu) return null;
  return priceType === "onDemand" ? gpu.onDemandPrice : gpu.spotPrice;
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState("All");
  const [category, setCategory] = useState<"gpu" | "cpu" | "storage" | "networking">("gpu");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredRegions = useMemo(() => {
    if (!data?.latest) return [];
    if (region === "All") return data.latest.regions;
    return data.latest.regions.filter((r) => r.name === region);
  }, [data, region]);

  const allGPUModels = useMemo(() => {
    if (!data?.latest) return [];
    const models = new Set<string>();
    for (const r of data.latest.regions) {
      for (const g of r.gpu) models.add(g.model);
    }
    return Array.from(models);
  }, [data]);

  const allCPUModels = useMemo(() => {
    if (!data?.latest) return [];
    const models = new Set<string>();
    for (const r of data.latest.regions) {
      for (const c of r.cpu) models.add(c.model);
    }
    return Array.from(models);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading pricing data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">Failed to load data: {error}</div>
      </div>
    );
  }

  if (!data?.latest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">
          No pricing data available yet. Run the scraper first.
        </div>
      </div>
    );
  }

  const { latest, gpuSeries, cpuSeries, totalSnapshots } = data;

  return (
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          CoreWeave Pricing Tracker
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>
            {totalSnapshots} snapshot{totalSnapshots !== 1 ? "s" : ""} collected
          </span>
          <span>
            Last updated:{" "}
            {latest
              ? new Date(latest.scrapedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "N/A"}
          </span>
          <a
            href="https://coreweave.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            View source
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <RegionSelector selected={region} onChange={setRegion} />

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {(["gpu", "cpu", "storage", "networking"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setSelectedModel(null);
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium uppercase transition-colors ${
                category === cat
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {category === "gpu" && (
        <GPUSection
          regions={filteredRegions}
          allModels={allGPUModels}
          gpuSeries={gpuSeries}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          latest={latest}
        />
      )}

      {category === "cpu" && (
        <CPUSection
          regions={filteredRegions}
          allModels={allCPUModels}
          cpuSeries={cpuSeries}
          latest={latest}
        />
      )}

      {category === "storage" && (
        <StorageSection regions={filteredRegions} />
      )}

      {category === "networking" && (
        <NetworkingSection regions={filteredRegions} />
      )}
    </main>
  );
}

function GPUSection({
  regions,
  allModels,
  gpuSeries,
  selectedModel,
  onSelectModel,
  latest,
}: {
  regions: PricingSnapshot["regions"];
  allModels: string[];
  gpuSeries: ModelSeries[];
  selectedModel: string | null;
  onSelectModel: (m: string | null) => void;
  latest: PricingSnapshot | null;
}) {
  const displayModel = selectedModel || allModels[0];

  return (
    <div>
      {allModels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {allModels.map((model, i) => (
            <button
              key={model}
              onClick={() => onSelectModel(model)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                displayModel === model
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500"
                  : "bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600"
              }`}
            >
              {model.replace("NVIDIA ", "")}
            </button>
          ))}
        </div>
      )}

      {displayModel && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">
            {displayModel}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {regions.map((region, ri) => {
              const series = getSeriesForModel(
                gpuSeries,
                displayModel,
                region.name
              );
              const gpu = region.gpu.find((g) => g.model === displayModel);

              return (
                <div
                  key={region.name}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-300">
                      {region.name}
                    </h3>
                    {gpu && (
                      <div className="flex gap-3 text-xs">
                        {gpu.onDemandPrice !== null && (
                          <span>
                            On-Demand:{" "}
                            <span className="text-white font-mono">
                              ${gpu.onDemandPrice.toFixed(2)}
                            </span>
                          </span>
                        )}
                        {gpu.spotPrice !== null && (
                          <span>
                            Spot:{" "}
                            <span className="text-white font-mono">
                              ${gpu.spotPrice.toFixed(2)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {series?.onDemand &&
                      series.onDemand.filter((p) => p.price !== null).length >
                        1 && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase mb-1">
                            On-Demand
                          </div>
                          <PriceChart
                            data={series.onDemand}
                            color={GPU_COLORS[ri % GPU_COLORS.length]}
                            label="On-Demand"
                          />
                        </div>
                      )}
                    {series?.spot &&
                      series.spot.filter((p) => p.price !== null).length >
                        1 && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase mb-1">
                            Spot
                          </div>
                          <PriceChart
                            data={series.spot}
                            color={GPU_COLORS[(ri + 2) % GPU_COLORS.length]}
                            label="Spot"
                          />
                        </div>
                      )}
                    {series?.inference &&
                      series.inference.filter((p) => p.price !== null).length >
                        1 && (
                        <div>
                          <div className="text-[10px] text-gray-500 uppercase mb-1">
                            Inference
                          </div>
                          <PriceChart
                            data={series.inference}
                            color={GPU_COLORS[(ri + 4) % GPU_COLORS.length]}
                            label="Inference"
                          />
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-4 py-3 text-gray-400 font-medium">Region</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">GPU Count</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">VRAM</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">vCPUs</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">RAM</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Storage</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">On-Demand</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Spot</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Inference</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((region) => {
                  const gpu = region.gpu.find((g) => g.model === displayModel);
                  if (!gpu) return null;
                  return (
                    <tr
                      key={region.name}
                      className="border-b border-gray-800/50 hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3 text-gray-300">{region.name}</td>
                      <td className="px-4 py-3 text-gray-400">{gpu.gpuCount}</td>
                      <td className="px-4 py-3 text-gray-400">{gpu.vramGB} GB</td>
                      <td className="px-4 py-3 text-gray-400">{gpu.vcpus}</td>
                      <td className="px-4 py-3 text-gray-400">{gpu.systemRAMGB} GB</td>
                      <td className="px-4 py-3 text-gray-400">{gpu.localStorageTB} TB</td>
                      <td className="px-4 py-3 font-mono text-white">
                        {gpu.onDemandPrice !== null
                          ? `$${gpu.onDemandPrice.toFixed(2)}`
                          : "Contact"}
                      </td>
                      <td className="px-4 py-3 font-mono text-white">
                        {gpu.spotPrice !== null
                          ? `$${gpu.spotPrice.toFixed(2)}`
                          : "N/A"}
                      </td>
                      <td className="px-4 py-3 font-mono text-white">
                        {gpu.inferencePrice !== null
                          ? `$${gpu.inferencePrice.toFixed(2)}`
                          : "N/A"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CPUSection({
  regions,
  allModels,
  cpuSeries,
  latest,
}: {
  regions: PricingSnapshot["regions"];
  allModels: string[];
  cpuSeries: ModelSeries[];
  latest: PricingSnapshot | null;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-gray-400 font-medium">Region</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Model</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Type</th>
            <th className="px-4 py-3 text-gray-400 font-medium">vCPUs</th>
            <th className="px-4 py-3 text-gray-400 font-medium">RAM</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Storage</th>
            <th className="px-4 py-3 text-gray-400 font-medium">On-Demand</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Spot</th>
          </tr>
        </thead>
        <tbody>
          {regions.flatMap((region) =>
            region.cpu.map((cpu) => (
              <tr
                key={`${region.name}-${cpu.model}`}
                className="border-b border-gray-800/50 hover:bg-gray-800/50"
              >
                <td className="px-4 py-3 text-gray-300">{region.name}</td>
                <td className="px-4 py-3 text-white font-medium">
                  {cpu.model}
                </td>
                <td className="px-4 py-3 text-gray-400">{cpu.cpuType}</td>
                <td className="px-4 py-3 text-gray-400">{cpu.vcpus}</td>
                <td className="px-4 py-3 text-gray-400">{cpu.systemRAMGB} GB</td>
                <td className="px-4 py-3 text-gray-400">{cpu.localStorageTB} TB</td>
                <td className="px-4 py-3 font-mono text-white">
                  {cpu.onDemandPrice !== null
                    ? `$${cpu.onDemandPrice.toFixed(2)}`
                    : "Contact"}
                </td>
                <td className="px-4 py-3 font-mono text-white">
                  {cpu.spotPrice !== null
                    ? `$${cpu.spotPrice.toFixed(2)}`
                    : "N/A"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StorageSection({
  regions,
}: {
  regions: PricingSnapshot["regions"];
}) {
  const storage = regions[0]?.storage || [];
  if (storage.length === 0) {
    return <p className="text-gray-400">No storage data available.</p>;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-gray-400 font-medium">Product</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Tier</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {storage.map((s) => (
            <tr
              key={`${s.product}-${s.tier}`}
              className="border-b border-gray-800/50 hover:bg-gray-800/50"
            >
              <td className="px-4 py-3 text-white">{s.product}</td>
              <td className="px-4 py-3 text-gray-400">{s.tier}</td>
              <td className="px-4 py-3 font-mono text-white">
                {s.price !== null ? `$${s.price.toFixed(4)}/GB/mo` : "N/A"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NetworkingSection({
  regions,
}: {
  regions: PricingSnapshot["regions"];
}) {
  const networking = regions[0]?.networking || [];
  if (networking.length === 0) {
    return <p className="text-gray-400">No networking data available.</p>;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left">
            <th className="px-4 py-3 text-gray-400 font-medium">Product</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Details</th>
            <th className="px-4 py-3 text-gray-400 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {networking.map((n) => (
            <tr
              key={n.product}
              className="border-b border-gray-800/50 hover:bg-gray-800/50"
            >
              <td className="px-4 py-3 text-white">{n.product}</td>
              <td className="px-4 py-3 text-gray-400">{n.details || "-"}</td>
              <td className="px-4 py-3 font-mono text-white">
                {n.price !== null ? `$${n.price.toLocaleString()}` : "Free"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
