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

export interface RegionSnapshot {
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
  regions: RegionSnapshot[];
}

export interface PricePoint {
  date: string;
  price: number | null;
}

export interface ModelSeries {
  model: string;
  region: string;
  onDemand: PricePoint[];
  spot: PricePoint[];
  inference: PricePoint[];
}
