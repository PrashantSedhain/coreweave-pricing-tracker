"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PricePoint } from "../types";

interface PriceChartProps {
  data: PricePoint[];
  color?: string;
  height?: number;
  showDots?: boolean;
}

function fmtData(points: PricePoint[]) {
  return points
    .filter((p) => p.price !== null)
    .map((p) => ({
      date: p.date.slice(5),
      price: p.price,
    }));
}

export default function PriceChart({
  data,
  color = "var(--accent)",
  height = 200,
  showDots = true,
}: PriceChartProps) {
  const chartData = fmtData(data);
  const allNull = data.length > 0 && chartData.length === 0;

  if (allNull) {
    return (
      <div
        className="flex items-center justify-center text-center rounded-md px-3 py-3"
        style={{
          height,
          color: "var(--text-muted)",
          backgroundColor: "var(--bg-tertiary)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Pricing not published
        <br />
        (contact sales)
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm rounded-md"
        style={{
          height,
          color: "var(--text-muted)",
          backgroundColor: "var(--bg-tertiary)",
        }}
      >
        No data available
      </div>
    );
  }

  const prices = chartData.map((d) => d.price!);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const pad = Math.max(range * 0.1, 0.5);

  const gridColor = "var(--border-color)";
  const tickColor = "var(--text-muted)";

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="date"
            tick={{ fill: tickColor, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fill: tickColor, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
            tickFormatter={(v: number) => {
              if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
              return `$${v.toFixed(v < 10 ? 2 : 0)}`;
            }}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-color)",
              borderRadius: "6px",
              fontSize: "13px",
              color: "var(--text-primary)",
            }}
            labelStyle={{ color: "var(--text-dim)", marginBottom: 2 }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            dot={showDots ? { r: 3, fill: color } : false}
            activeDot={{ r: 5, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
