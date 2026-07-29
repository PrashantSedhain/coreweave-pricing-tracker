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

interface PriceChartProps {
  data: PricePoint[];
  color: string;
  label: string;
}

function formatChartData(points: PricePoint[]) {
  return points
    .filter((p) => p.price !== null)
    .map((p) => ({
      date: p.date.slice(5),
      price: p.price,
    }));
}

export default function PriceChart({ data, color, label }: PriceChartProps) {
  const chartData = formatChartData(data);

  if (chartData.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">
        Not enough data points for {label}
      </div>
    );
  }

  const prices = chartData.map((d) => d.price!);
  const min = Math.floor(Math.min(...prices) * 0.95);
  const max = Math.ceil(Math.max(...prices) * 1.05);

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fill: "#9ca3af", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #374151",
              borderRadius: "8px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, label]}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "#9ca3af" }} />
          <Line
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
            name={label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
