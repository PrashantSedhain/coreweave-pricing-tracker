"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PricePoint } from "../types";

const COLORS = [
  "#58a6ff", "#f59e0b", "#a78bfa", "#f87171", "#4ade80",
  "#22d3ee", "#fb923c", "#a3e635", "#e879f9", "#fbbf24",
  "#34d399", "#818cf8", "#f472b6", "#2dd4bf", "#facc15",
];

interface LineDef {
  key: string;
  label: string;
  data: PricePoint[];
  color: string;
}

function buildCombinedData(lines: LineDef[]) {
  const dateMap: Record<string, Record<string, number | null>> = {};
  for (const line of lines) {
    for (const p of line.data) {
      if (p.price === null) continue;
      if (!dateMap[p.date]) dateMap[p.date] = {};
      dateMap[p.date][line.key] = p.price;
    }
  }
  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: date.slice(5),
      ...values,
    }));
}

export default function MultiLineChart({
  lines,
  height,
  showDots,
}: {
  lines: LineDef[];
  height?: number;
  showDots?: boolean;
}) {
  const chartData = buildCombinedData(lines);
  const validLines = lines.filter((l) => l.data.some((p) => p.price !== null));

  if (chartData.length === 0 || validLines.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm rounded-md"
        style={{
          height: height || 300,
          color: "var(--text-muted)",
          backgroundColor: "var(--bg-tertiary)",
        }}
      >
        No data
      </div>
    );
  }

  const allPrices = validLines.flatMap((l) =>
    l.data.filter((p) => p.price !== null).map((p) => p.price!)
  );
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const pad = Math.max((max - min) * 0.05, 0.5);

  return (
    <div style={{ width: "100%", height: height || 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-dim)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-color)", strokeWidth: 1 }}
            interval={chartData.length > 12 ? Math.floor(chartData.length / 6) : 0}
            tickFormatter={(v: string) => {
              if (chartData.length > 25) {
                const parts = v.split("-");
                return parts[0] ? `${parts[1] || ""}` : v;
              }
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const [m, d] = v.split("-");
              return m ? `${months[parseInt(m)-1] || m} ${d || ""}` : v;
            }}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fill: "var(--text-dim)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-color)", strokeWidth: 1 }}
            tickFormatter={(v: number) => {
              if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
              return `$${v.toFixed(v < 10 ? 2 : 0)}`;
            }}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-color-strong)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--text-primary)",
              padding: "10px 14px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
            labelStyle={{ color: "var(--text-dim)", marginBottom: 4, fontWeight: 600 }}
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "var(--text-dim)", paddingTop: 8 }}
            verticalAlign="bottom"
            iconSize={10}
            iconType="circle"
          />
          {validLines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2.5}
              dot={showDots ? { r: 3, fill: line.color, strokeWidth: 1, stroke: "var(--bg-surface)" } : false}
              activeDot={{ r: 5, fill: line.color, strokeWidth: 2, stroke: "var(--bg-surface)" }}
              name={line.label}
              animationDuration={600}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
