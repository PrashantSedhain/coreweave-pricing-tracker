import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { parseAll, type PricingSnapshot } from "./parser";

const DATA_DIR = path.resolve(__dirname, "..", "data");
const CDX_URL =
  "https://web.archive.org/cdx/search/cdx?url=coreweave.com/pricing&output=text&limit=100&fl=timestamp,statuscode&filter=statuscode:200&from=20260101&to=20260729&collapse=timestamp:8&sort=timestamp";

function waybackURL(timestamp: string): string {
  return `https://web.archive.org/web/${timestamp}id_/https://coreweave.com/pricing`;
}

function timestampToDate(ts: string): string {
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

async function fetchArchivedPage(
  browser: any,
  url: string
): Promise<string> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(3000);

    const hasContent = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      return text.length > 500;
    });

    if (!hasContent) {
      console.log("  Page appears empty, trying longer wait...");
      await page.waitForTimeout(5000);
    }

    const rawText = await page.evaluate(() => {
      return document.body?.innerText || "";
    });

    return rawText;
  } finally {
    await context.close();
  }
}

async function getSnapshotTimestamps(): Promise<string[]> {
  const resp = await fetch(CDX_URL);
  const text = await resp.text();
  return text
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean)
    .sort();
}

async function main() {
  const snapshots = [
    "20260106014605",
    "20260118105519",
    "20260122183416",
    "20260123012337",
    "20260225001139",
    "20260313081744",
    "20260415105017",
    "20260417110551",
    "20260429003247",
    "20260510055757",
    "20260512101710",
    "20260521183256",
    "20260527123707",
    "20260605195952",
    "20260626170907",
    "20260727103436",
  ];

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });

  let success = 0;
  let failed = 0;

  for (let idx = 0; idx < snapshots.length; idx++) {
    const ts = snapshots[idx];
    const dateStr = timestampToDate(ts);
    const outPath = path.join(DATA_DIR, `${dateStr}.json`);

    if (fs.existsSync(outPath)) {
      console.log(`[${idx + 1}/${snapshots.length}] ${dateStr} — already exists, skipping`);
      success++;
      continue;
    }

    const url = waybackURL(ts);
    console.log(`[${idx + 1}/${snapshots.length}] ${dateStr} — fetching...`);

    try {
      const rawText = await fetchArchivedPage(browser, url);

      if (!rawText || rawText.length < 500) {
        console.log(`  Failed: page too short (${rawText?.length || 0} chars)`);
        failed++;
        continue;
      }

      const regions = parseAll(rawText);

      const snapshot: PricingSnapshot = {
        scrapeDate: dateStr,
        scrapedAt: new Date(
          `${dateStr}T00:00:00.000Z`
        ).toISOString(),
        source: url,
        regions,
      };

      fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

      const gpuCount = regions.reduce((sum, r) => sum + r.gpu.length, 0);
      const cpuCount = regions.reduce((sum, r) => sum + r.cpu.length, 0);
      console.log(`  OK: ${gpuCount} GPUs, ${cpuCount} CPUs across ${regions.length} regions`);
      success++;

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err: any) {
      console.log(`  Failed: ${err.message}`);
      failed++;
    }
  }

  await browser.close();
  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
