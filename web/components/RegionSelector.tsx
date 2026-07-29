"use client";

interface RegionSelectorProps {
  selected: string;
  onChange: (region: string) => void;
}

const REGIONS = ["All", "North America", "Europe"];

export default function RegionSelector({
  selected,
  onChange,
}: RegionSelectorProps) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {REGIONS.map((region) => (
        <button
          key={region}
          onClick={() => onChange(region)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            selected === region
              ? "bg-indigo-600 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          {region}
        </button>
      ))}
    </div>
  );
}
