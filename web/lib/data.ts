import fs from "fs";
import path from "path";
import type { PricingSnapshot, ModelSeries, PricePoint } from "../types";

export { filterByDays, aggregateByWeek, aggregateByMonth } from "./data-utils";

export function loadAllSnapshots(): PricingSnapshot[] {
  const dataDir = path.resolve(process.cwd(), "public/data");
  if (!fs.existsSync(dataDir)) return [];

  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dataDir, file), "utf-8");
    return JSON.parse(raw) as PricingSnapshot;
  });
}

function buildPricePoints(
  snapshots: PricingSnapshot[],
  model: string,
  region: string,
  getPrices: (regionData: any) => { onDemand: number | null; spot: number | null; inference: number | null }
): ModelSeries {
  const series: ModelSeries = {
    model,
    region,
    onDemand: [],
    spot: [],
    inference: [],
  };
  for (const snap of snapshots) {
    const point = (p: number | null): PricePoint => ({ date: snap.scrapeDate, price: p });
    const regionData = snap.regions.find((r) => r.name === region);
    if (!regionData) {
      series.onDemand.push(point(null));
      series.spot.push(point(null));
      series.inference.push(point(null));
      continue;
    }
    const prices = getPrices(regionData);
    series.onDemand.push(point(prices.onDemand));
    series.spot.push(point(prices.spot));
    series.inference.push(point(prices.inference));
  }
  return series;
}

export function buildModelSeries(snapshots: PricingSnapshot[]): ModelSeries[] {
  const seriesMap = new Map<string, ModelSeries>();

  for (const snap of snapshots) {
    for (const region of snap.regions) {
      for (const gpu of region.gpu) {
        const key = `${gpu.model}::${region.name}`;
        if (!seriesMap.has(key)) {
          const series = buildPricePoints(snapshots, gpu.model, region.name, (r) => {
            const found = r.gpu.find((g: any) => g.model === gpu.model);
            return found
              ? { onDemand: found.onDemandPrice, spot: found.spotPrice, inference: found.inferencePrice }
              : { onDemand: null, spot: null, inference: null };
          });
          seriesMap.set(key, series);
        }
      }
    }
  }

  return Array.from(seriesMap.values());
}

export function buildCPUSeries(snapshots: PricingSnapshot[]): ModelSeries[] {
  const seriesMap = new Map<string, ModelSeries>();

  function normalizeType(t: string): string | null {
    if (/^\$/.test(t)) return null;
    if (/^contact/i.test(t)) return null;
    let cleaned = t.replace(/[\(\)]/g, " ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned;
  }

  for (const snap of snapshots) {
    for (const region of snap.regions) {
      for (const cpu of region.cpu) {
        const type = normalizeType(cpu.cpuType);
        if (!type) continue;

        const key = `${cpu.model}|${type}::${region.name}`;
        if (!seriesMap.has(key)) {
          const series = buildPricePoints(
            snapshots,
            `${cpu.model} (${type})`,
            region.name,
            (r) => {
              const found = r.cpu.find(
                (c: any) => c.model === cpu.model && normalizeType(c.cpuType) === type
              );
              return found
                ? { onDemand: found.onDemandPrice, spot: found.spotPrice, inference: null }
                : { onDemand: null, spot: null, inference: null };
            }
          );
          seriesMap.set(key, series);
        }
      }
    }
  }

  return Array.from(seriesMap.values());
}

export interface DashboardData {
  latest: PricingSnapshot;
  snapshots: PricingSnapshot[];
  gpuSeries: ModelSeries[];
  cpuSeries: ModelSeries[];
  storageSeries: ModelSeries[];
  networkingSeries: ModelSeries[];
  totalSnapshots: number;
}

function buildStorageSeries(snapshots: PricingSnapshot[]): ModelSeries[] {
  const products = new Set<string>();
  for (const snap of snapshots) {
    const region = snap.regions[0];
    if (!region) continue;
    for (const s of region.storage) {
      products.add(`${s.product}::${s.tier}`);
    }
  }

  return Array.from(products).map((key) => {
    const [product, tier] = key.split("::");
    const points: PricePoint[] = [];
    for (const snap of snapshots) {
      const region = snap.regions[0];
      const entry = region?.storage.find(
        (s: any) => s.product === product && s.tier === tier
      );
      points.push({ date: snap.scrapeDate, price: entry?.price ?? null });
    }
    return {
      model: `${product} · ${tier}`,
      region: "Global",
      onDemand: points,
      spot: [],
      inference: [],
    };
  });
}

function buildNetworkingSeries(snapshots: PricingSnapshot[]): ModelSeries[] {
  const products = new Set<string>();
  for (const snap of snapshots) {
    const region = snap.regions[0];
    if (!region) continue;
    for (const n of region.networking) {
      products.add(n.product);
    }
  }

  return Array.from(products).map((product) => {
    const points: PricePoint[] = [];
    for (const snap of snapshots) {
      const region = snap.regions[0];
      const entry = region?.networking.find((n: any) => n.product === product);
      points.push({ date: snap.scrapeDate, price: entry?.price ?? null });
    }
    return {
      model: product,
      region: "Global",
      onDemand: points,
      spot: [],
      inference: [],
    };
  });
}

export function getDashboardData(): DashboardData | null {
  const snapshots = loadAllSnapshots();
  if (snapshots.length === 0) return null;

  return {
    latest: snapshots[snapshots.length - 1],
    snapshots,
    gpuSeries: buildModelSeries(snapshots),
    cpuSeries: buildCPUSeries(snapshots),
    storageSeries: buildStorageSeries(snapshots),
    networkingSeries: buildNetworkingSeries(snapshots),
    totalSnapshots: snapshots.length,
  };
}
