import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { PricingSnapshot, ModelSeries, PricePoint } from "../../../types";

function loadAllSnapshots(): PricingSnapshot[] {
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

function buildModelSeries(
  snapshots: PricingSnapshot[]
): ModelSeries[] {
  const seriesMap = new Map<string, ModelSeries>();

  for (const snap of snapshots) {
    for (const region of snap.regions) {
      for (const gpu of region.gpu) {
        const key = `${gpu.model}::${region.name}`;
        if (!seriesMap.has(key)) {
          seriesMap.set(key, {
            model: gpu.model,
            region: region.name,
            onDemand: [],
            spot: [],
            inference: [],
          });
        }
        const series = seriesMap.get(key)!;
        const point = (p: number | null): PricePoint => ({
          date: snap.scrapeDate,
          price: p,
        });
        series.onDemand.push(point(gpu.onDemandPrice));
        series.spot.push(point(gpu.spotPrice));
        series.inference.push(point(gpu.inferencePrice));
      }
    }
  }

  return Array.from(seriesMap.values());
}

function buildCPUSeries(snapshots: PricingSnapshot[]): ModelSeries[] {
  const seriesMap = new Map<string, ModelSeries>();

  for (const snap of snapshots) {
    for (const region of snap.regions) {
      for (const cpu of region.cpu) {
        const key = `${cpu.model}|${cpu.cpuType}::${region.name}`;
        if (!seriesMap.has(key)) {
          seriesMap.set(key, {
            model: `${cpu.model} (${cpu.cpuType})`,
            region: region.name,
            onDemand: [],
            spot: [],
            inference: [],
          });
        }
        const series = seriesMap.get(key)!;
        const point = (p: number | null): PricePoint => ({
          date: snap.scrapeDate,
          price: p,
        });
        series.onDemand.push(point(cpu.onDemandPrice));
        series.spot.push(point(cpu.spotPrice));
      }
    }
  }

  return Array.from(seriesMap.values());
}

export async function GET() {
  const snapshots = loadAllSnapshots();
  const latest = snapshots[snapshots.length - 1] || null;
  const gpuSeries = buildModelSeries(snapshots);
  const cpuSeries = buildCPUSeries(snapshots);

  return NextResponse.json({
    latest,
    snapshots: snapshots.map((s) => ({
      date: s.scrapeDate,
      scrapedAt: s.scrapedAt,
      regions: s.regions,
    })),
    gpuSeries,
    cpuSeries,
    totalSnapshots: snapshots.length,
  });
}
