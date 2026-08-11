"use client";

import { useState, useEffect } from "react";
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

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
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
  const isMobile = useIsMobile();
  const h = height || 300;

  if (chartData.length === 0 || validLines.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm rounded-md"
        style={{
          height: h,
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

  const tickFontSize = isMobile ? 9 : 11;
  const legendFontSize = isMobile ? 10 : 12;
  const manyLines = validLines.length > 6;
  const tickCount = isMobile && manyLines ? Math.floor(chartData.length / 3) : (chartData.length > 12 ? Math.floor(chartData.length / 6) : 0);

  const gridColor = "var(--border-color)";
  const tickColor = "var(--text-dim)";

  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tick={{ fill: tickColor, fontSize: tickFontSize }}
            tickLine={false}
            axisLine={{ stroke: gridColor, strokeWidth: 1 }}
            interval={tickCount > 0 ? tickCount : 0}
            angle={isMobile && chartData.length > 10 ? -45 : 0}
            textAnchor={isMobile && chartData.length > 10 ? "end" : "middle"}
            height={isMobile && chartData.length > 10 ? 40 : undefined}
            tickFormatter={(v: string) => {
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const [m, d] = v.split("-");
              if (isMobile && chartData.length > 10) {
                return m ? `${months[parseInt(m)-1] || m}` : v;
              }
              return m ? `${months[parseInt(m)-1] || m} ${d || ""}` : v;
            }}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fill: tickColor, fontSize: tickFontSize }}
            tickLine={false}
            axisLine={{ stroke: gridColor, strokeWidth: 1 }}
            tickFormatter={(v: number) => {
              if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
              return `$${v.toFixed(v < 10 ? 2 : 0)}`;
            }}
            width={isMobile ? 44 : 55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-color-strong)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--text-primary)",
              padding: "8px 10px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
            labelStyle={{ color: "var(--text-dim)", marginBottom: 4, fontWeight: 600 }}
            formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name]}
          />
          {!isMobile && !manyLines && (
            <Legend
              wrapperStyle={{ fontSize: legendFontSize, color: "var(--text-dim)", paddingTop: 6 }}
              verticalAlign="bottom"
              iconSize={10}
              iconType="circle"
            />
          )}
          {validLines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2.5}
              dot={showDots ? { r: isMobile ? 2 : 3, fill: line.color, strokeWidth: 1, stroke: "var(--bg-surface)" } : false}
              activeDot={{ r: 5, fill: line.color, strokeWidth: 2, stroke: "var(--bg-surface)" }}
              name={line.label}
              animationDuration={400}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
