import { NextResponse } from "next/server";
import { getDashboardData } from "../../../lib/data";

export async function GET() {
  const data = getDashboardData();

  if (!data) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  return NextResponse.json({
    latest: data.latest,
    snapshots: data.snapshots.map((s) => ({
      date: s.scrapeDate,
      scrapedAt: s.scrapedAt,
      regions: s.regions,
    })),
    gpuSeries: data.gpuSeries,
    cpuSeries: data.cpuSeries,
    storageSeries: data.storageSeries,
    networkingSeries: data.networkingSeries,
    totalSnapshots: data.totalSnapshots,
  });
}
