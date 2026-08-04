import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
import { parseAll, type PricingSnapshot } from "./parser";

const PRICING_URL = "https://coreweave.com/pricing";
const DATA_DIR = path.resolve(__dirname, "..", "data");

async function scrapePage(): Promise<PricingSnapshot> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    await page.goto(PRICING_URL, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || "";
        return text.includes("On-Demand Price") || text.includes("GPU Model");
      },
      { timeout: 15000 }
    );

    const rawText = await page.evaluate(() => {
      return document.body?.innerText || "";
    });

    const regions = parseAll(rawText);

    return {
      scrapeDate: new Date().toISOString().split("T")[0],
      scrapedAt: new Date().toISOString(),
      source: PRICING_URL,
      regions,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`Scraping ${PRICING_URL}...`);
  const snapshot = await scrapePage();

  const today = snapshot.scrapeDate;
  const filePath = path.join(DATA_DIR, `${today}.json`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`Saved to ${filePath}`);

  for (const region of snapshot.regions) {
    console.log(
      `\n${region.name}: ${region.gpu.length} GPUs, ${region.cpu.length} CPUs, ${region.storage.length} storage, ${region.networking.length} networking`
    );
    for (const gpu of region.gpu) {
      console.log(
        `  GPU ${gpu.model}: onDemand=${gpu.onDemandPrice}, spot=${gpu.spotPrice}, inference=${gpu.inferencePrice}`
      );
    }
    for (const cpu of region.cpu) {
      console.log(
        `  CPU ${cpu.model} | ${cpu.cpuType}: onDemand=${cpu.onDemandPrice}, spot=${cpu.spotPrice}`
      );
    }
  }
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
