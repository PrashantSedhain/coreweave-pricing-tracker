export interface GPUPricing {
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

export interface CPUPricing {
  model: string;
  cpuType: string;
  vcpus: string;
  systemRAMGB: string;
  localStorageTB: string;
  onDemandPrice: number | null;
  spotPrice: number | null;
}

export interface StoragePricing {
  product: string;
  tier: string;
  price: number | null;
}

export interface NetworkingPricing {
  product: string;
  details: string;
  price: number | null;
}

export interface RegionData {
  name: string;
  gpu: GPUPricing[];
  cpu: CPUPricing[];
  storage: StoragePricing[];
  networking: NetworkingPricing[];
}

export interface PricingSnapshot {
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

interface Section {
  region: string;
  type: "gpu" | "cpu";
  startLine: number;
  colCount: number;
}

function findSections(lines: string[]): Section[] {
  const sections: Section[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regionMatch = line.match(/^REGION:\s*(NORTH\s*AMERICA|EUROPE)/i);
    if (!regionMatch) continue;

    const region =
      regionMatch[1].toUpperCase() === "NORTH AMERICA"
        ? "North America"
        : "Europe";

    for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
      if (/^GPU\s*Model/i.test(lines[j])) {
        const headerSlice = lines.slice(j, j + 12).join(" ");
        const hasSpot = /Spot/i.test(headerSlice);
        const hasInference = /Inference/i.test(headerSlice);
        const colCount = (hasSpot && hasInference) ? 8 : (hasSpot ? 7 : 6);
        sections.push({ region, type: "gpu", startLine: j + 1, colCount });
        break;
      }
      if (/^CPU\s*Model/i.test(lines[j])) {
        sections.push({ region, type: "cpu", startLine: j + 1, colCount: 6 });
        break;
      }
    }
  }

  return sections;
}

function findFirstGPU(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^(NVIDIA\s|HGX\s|RTX\s)/i.test(line)) return i;
  }
  return -1;
}

function parseGPURows(
  lines: string[],
  startLine: number,
  region: string,
  colCount: number
): GPUPricing[] {
  const gpus: GPUPricing[] = [];
  const seenModels = new Set<string>();
  const hasInference = region === "North America" && colCount >= 8;

  let i = startLine;
  while (i < lines.length && /^GPU\s*Model/i.test(lines[i])) i++;

  i = findFirstGPU(lines, i);
  if (i < 0) return gpus;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) { i++; continue; }
    if (/^REGION:/i.test(line)) break;

    let model = "";
    if (/^NVIDIA\s/i.test(line)) {
      model = line;
    } else if (/^(HGX|RTX|NVIDIA)[\s$]/i.test(line)) {
      model = "NVIDIA " + line;
    } else {
      i++;
      continue;
    }

    i++;

    const dataLines: string[] = [];
    while (i < lines.length && dataLines.length < colCount) {
      const dl = lines[i];
      if (!dl) { i++; continue; }
      if (/^(NVIDIA\s|HGX\s|RTX\s|REGION:|GPU\s*Model|On-demand)/i.test(dl)) break;
      dataLines.push(dl);
      i++;
    }

    if (dataLines.length >= 5) {
      let onDemandPrice = parsePrice(dataLines[5] || "");
      let spotPrice = parsePrice(colCount >= 7 ? (dataLines[6] || "") : "");
      let inferencePrice = hasInference ? parsePrice(dataLines[7] || "") : null;

      const normalizedModel = model.trim();
      if (seenModels.has(normalizedModel)) continue;

      const lookaheadStart = Math.max(i - dataLines.length, 0);
      const lookaheadEnd = Math.min(i + 12, lines.length);
      const lookahead = lines.slice(lookaheadStart, lookaheadEnd).join(" ");

      if (spotPrice === null) {
        const spotMatch = lookahead.match(/Spot\s+(?:Price:?\s*)?\$?([\d,.]+)\s*\/?\s*Hour/i);
        if (spotMatch) spotPrice = parsePrice(spotMatch[1]);
      }
      if (inferencePrice === null && hasInference) {
        const infMatch = lookahead.match(/Inference\s+Single\s+(?:GPU|CPU)\s+Price:?\s*\$?([\d,.]+)/i);
        if (infMatch) inferencePrice = parsePrice(infMatch[1]);
      }

      seenModels.add(normalizedModel);

      gpus.push({
        model: normalizedModel,
        gpuCount: dataLines[0] || "",
        vramGB: dataLines[1] || "",
        vcpus: dataLines[2] || "",
        systemRAMGB: dataLines[3] || "",
        localStorageTB: dataLines[4] || "",
        onDemandPrice,
        spotPrice,
        inferencePrice,
      });
    }
  }

  return gpus;
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
      const cpuType = dataLines[0] || "";
      if (/^\$/.test(cpuType)) continue;
      if (/^contact/i.test(cpuType)) continue;
      cpus.push({
        model,
        cpuType,
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
    { product: "CoreWeave AI Object Storage", tier: "Hot", regex: /Hot[\s\S]*?\$([\d.]+)/i },
    { product: "CoreWeave AI Object Storage", tier: "Warm", regex: /Warm[\s\S]*?\$([\d.]+)/i },
    { product: "CoreWeave AI Object Storage", tier: "Cold", regex: /Cold[\s\S]*?\$([\d.]+)/i },
    { product: "CoreWeave AI Object Storage", tier: "Archive", regex: /Archive[\s\S]*?\$([\d.]+)/i },
    { product: "Distributed File Storage", tier: "-", regex: /Distributed\s+File\s+Storage[\s\S]*?\$([\d.]+)/i },
  ];

  for (const { product, tier, regex } of patterns) {
    const match = text.match(regex);
    storage.push({ product, tier, price: match ? parseFloat(match[1]) : null });
  }

  return storage;
}

function parseNetworking(text: string): NetworkingPricing[] {
  const networking: NetworkingPricing[] = [];

  const entries: Array<{ product: string; details: string; regex: RegExp }> = [
    { product: "Public IP Address", details: "per IP / month", regex: /Public\s+IP\s+Address[\s\S]*?\$([\d,.]+)/i },
    { product: "Bring Your Own IP", details: "one-time setup fee per IP", regex: /Bring\s+Your\s+Own\s+IP[\s\S]*?\$([\d,.]+)/i },
    { product: "Direct Connect 400G", details: "Dedicated DX monthly", regex: /400G[\s\S]*?\$([\d,.]+)/i },
    { product: "Direct Connect 100G", details: "Dedicated DX monthly", regex: /100G[\s\S]*?\$([\d,.]+)/i },
    { product: "Direct Connect 10G Dedicated", details: "Dedicated DX monthly", regex: /10G[\s\S]*?Dedicated[\s\S]*?\$([\d,.]+)/i },
    { product: "Direct Connect 10G Virtual", details: "Virtual DX monthly", regex: /10G[\s\S]*?Virtual[\s\S]*?\$([\d,.]+)/i },
  ];

  for (const { product, details, regex } of entries) {
    const match = text.match(regex);
    networking.push({ product, details, price: match ? parseFloat(match[1].replace(/,/g, "")) : null });
  }

  return networking;
}

export function parseAll(rawText: string): RegionData[] {
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
      const gpus = parseGPURows(lines, section.startLine, section.region, section.colCount);
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
