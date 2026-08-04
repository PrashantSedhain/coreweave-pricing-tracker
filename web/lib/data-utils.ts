import type { ModelSeries, PricePoint } from "../types";

export function filterByDays(series: ModelSeries, days: number): ModelSeries {
  if (days <= 0) return series;
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  return {
    ...series,
    onDemand: series.onDemand.filter((p) => p.date >= cutoffStr),
    spot: series.spot.filter((p) => p.date >= cutoffStr),
    inference: series.inference.filter((p) => p.date >= cutoffStr),
  };
}

export function aggregateByWeek(points: PricePoint[]): PricePoint[] {
  const grouped: Record<string, number[]> = {};
  for (const p of points) {
    if (p.price === null) continue;
    const d = new Date(p.date + "T00:00:00Z");
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().split("T")[0];
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p.price);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({
      date,
      price: prices.reduce((s, p) => s + p, 0) / prices.length,
    }));
}

export function aggregateByMonth(points: PricePoint[]): PricePoint[] {
  const grouped: Record<string, number[]> = {};
  for (const p of points) {
    if (p.price === null) continue;
    const key = p.date.slice(0, 7);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p.price);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prices]) => ({
      date,
      price: prices.reduce((s, p) => s + p, 0) / prices.length,
    }));
}
