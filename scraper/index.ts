import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const PRICING_URL = "https://coreweave.com/pricing";
const DATA_DIR = path.resolve(__dirname, "..", "data");

interface GPUPricing {
  model: string;
  gpuCount: string;
  vramGB: string;
  vcpus: string;
  systemRAMGB: string;
  localStorageTB: string;
  onDemandPrice: number | null;
  spotPrice: number | null;
  inferencePrice: number | null;
}

interface CPUPricing {
  model: string;
  cpuType: string;
  vcpus: string;
  systemRAMGB: string;
  localStorageTB: string;
  onDemandPrice: number | null;
  spotPrice: number | null;
}

interface StoragePricing {
  product: string;
  tier: string;
  price: number | null;
}

interface NetworkingPricing {
  product: string;
  details: string;
  price: number | null;
}

interface RegionData {
  name: string;
  gpu: GPUPricing[];
  cpu: CPUPricing[];
  storage: StoragePricing[];
  networking: NetworkingPricing[];
}

interface PricingSnapshot {
  scrapeDate: string;
  scrapedAt: string;
  source: string;
  regions: RegionData[];
}

function parsePrice(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

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

interface Section {
  region: string;
  type: "gpu" | "cpu";
  startLine: number;
}

function findSections(lines: string[]): Section[] {
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regionMatch = line.match(/^REGION:\s*(NORTH\s*AMERICA|EUROPE)/i);
    if (!regionMatch) continue;

    const region =
      regionMatch[1].toUpperCase() === "NORTH AMERICA" ||
      regionMatch[1].toUpperCase() === "NORTH AMERICA"
        ? "North America"
        : "Europe";

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (/^GPU\s*Model/i.test(lines[j])) {
        sections.push({ region, type: "gpu", startLine: j + 1 });
        break;
      }
      if (/^CPU\s*Model/i.test(lines[j])) {
        sections.push({ region, type: "cpu", startLine: j + 1 });
        break;
      }
    }
  }

  return sections;
}

function parseAll(rawText: string): RegionData[] {
  const lines = rawText.split("\n").map((l) => l.trim());
  const sections = findSections(lines);

  const regionMap: Record<string, RegionData> = {};

  for (const section of sections) {
    if (!regionMap[section.region]) {
      regionMap[section.region] = {
        name: section.region,
        gpu: [],
        cpu: [],
        storage: [],
        networking: [],
      };
    }
  }

  for (const section of sections) {
    if (section.type === "gpu") {
      const gpus = parseGPURows(lines, section.startLine, section.region);
      regionMap[section.region].gpu.push(...gpus);
    } else {
      const cpus = parseCPURows(lines, section.startLine);
      regionMap[section.region].cpu.push(...cpus);
    }
  }

  const regions = Object.values(regionMap);

  for (const region of regions) {
    region.storage = parseStorage(rawText);
    region.networking = parseNetworking(rawText);
  }

  return regions;
}

function parseGPURows(
  lines: string[],
  startLine: number,
  region: string
): GPUPricing[] {
  const gpus: GPUPricing[] = [];
  const hasInference = region === "North America";

  let i = startLine;
  while (i < lines.length && /^GPU\s*Model/i.test(lines[i])) i++;

  i = findFirstGPU(lines, i);
  if (i < 0) return gpus;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }
    if (/^REGION:/i.test(line)) break;

    if (!/^NVIDIA\s/i.test(line)) { i++; continue; }

    const model = line;
    i++;

    const dataLines: string[] = [];
    while (i < lines.length && dataLines.length < 8) {
      const dl = lines[i];
      if (!dl) { i++; continue; }
      if (/^(NVIDIA\s|REGION:|GPU\s*Model|On-demand)/i.test(dl)) break;
      dataLines.push(dl);
      i++;
    }

    if (dataLines.length >= 6) {
      const onDemandRaw = dataLines[5];
      const spotRaw = dataLines[6];
      const inferenceRaw = hasInference ? (dataLines[7] || "") : "";

      gpus.push({
        model,
        gpuCount: dataLines[0] || "",
        vramGB: dataLines[1] || "",
        vcpus: dataLines[2] || "",
        systemRAMGB: dataLines[3] || "",
        localStorageTB: dataLines[4] || "",
        onDemandPrice: parsePrice(onDemandRaw),
        spotPrice: parsePrice(spotRaw),
        inferencePrice: hasInference ? parsePrice(inferenceRaw) : null,
      });
    }
  }

  return gpus;
}

function findFirstGPU(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    if (/^NVIDIA\s/i.test(lines[i])) return i;
  }
  return -1;
}

function parseCPURows(lines: string[], startLine: number): CPUPricing[] {
  const cpus: CPUPricing[] = [];

  let i = startLine;
  while (i < lines.length && /^CPU\s*Model/i.test(lines[i])) i++;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/^REGION:/i.test(line)) break;

    if (!/^(AMD\s|Intel\s)/i.test(line)) continue;

    const model = line;
    i++;

    const dataLines: string[] = [];
    while (i < lines.length && dataLines.length < 6) {
      const dl = lines[i];
      if (!dl) { i++; continue; }
      if (/^(AMD\s|Intel\s|REGION:|CPU\s*Model)/i.test(dl)) break;
      if (dl === "CPU Model" || dl === "CPU\u00a0Type" || dl === "CPU Type") { i++; continue; }
      dataLines.push(dl);
      i++;
    }
    i--;

    if (dataLines.length >= 5) {
      cpus.push({
        model,
        cpuType: dataLines[0] || "",
        vcpus: dataLines[1] || "",
        systemRAMGB: dataLines[2] || "",
        localStorageTB: dataLines[3] || "",
        onDemandPrice: parsePrice(dataLines[4]),
        spotPrice: parsePrice(dataLines[5] || ""),
      });
    }
  }

  return cpus;
}

function parseStorage(text: string): StoragePricing[] {
  const storage: StoragePricing[] = [];

  const patterns: Array<{
    product: string;
    tier: string;
    regex: RegExp;
  }> = [
    {
      product: "CoreWeave AI Object Storage",
      tier: "Hot",
      regex: /Hot[\s\S]*?\$([\d.]+)/i,
    },
    {
      product: "CoreWeave AI Object Storage",
      tier: "Warm",
      regex: /Warm[\s\S]*?\$([\d.]+)/i,
    },
    {
      product: "CoreWeave AI Object Storage",
      tier: "Cold",
      regex: /Cold[\s\S]*?\$([\d.]+)/i,
    },
    {
      product: "CoreWeave AI Object Storage",
      tier: "Archive",
      regex: /Archive[\s\S]*?\$([\d.]+)/i,
    },
    {
      product: "Distributed File Storage",
      tier: "-",
      regex: /Distributed\s+File\s+Storage[\s\S]*?\$([\d.]+)/i,
    },
  ];

  for (const { product, tier, regex } of patterns) {
    const match = text.match(regex);
    storage.push({
      product,
      tier,
      price: match ? parseFloat(match[1]) : null,
    });
  }

  return storage;
}

function parseNetworking(text: string): NetworkingPricing[] {
  const networking: NetworkingPricing[] = [];

  const entries: Array<{
    product: string;
    details: string;
    regex: RegExp;
  }> = [
    {
      product: "Public IP Address",
      details: "per IP / month",
      regex: /Public\s+IP\s+Address[\s\S]*?\$([\d,.]+)/i,
    },
    {
      product: "Bring Your Own IP",
      details: "one-time setup fee per IP",
      regex: /Bring\s+Your\s+Own\s+IP[\s\S]*?\$([\d,.]+)/i,
    },
    {
      product: "Direct Connect 400G",
      details: "Dedicated DX monthly",
      regex: /400G[\s\S]*?\$([\d,.]+)/i,
    },
    {
      product: "Direct Connect 100G",
      details: "Dedicated DX monthly",
      regex: /100G[\s\S]*?\$([\d,.]+)/i,
    },
    {
      product: "Direct Connect 10G Dedicated",
      details: "Dedicated DX monthly",
      regex: /10G[\s\S]*?Dedicated[\s\S]*?\$([\d,.]+)/i,
    },
    {
      product: "Direct Connect 10G Virtual",
      details: "Virtual DX monthly",
      regex: /10G[\s\S]*?Virtual[\s\S]*?\$([\d,.]+)/i,
    },
  ];

  for (const { product, details, regex } of entries) {
    const match = text.match(regex);
    networking.push({
      product,
      details,
      price: match ? parseFloat(match[1].replace(/,/g, "")) : null,
    });
  }

  return networking;
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
