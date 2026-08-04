"use client";

import { useState } from "react";

type Theme = "a" | "b" | "c";

const themes: { key: Theme; label: string; swatch: string }[] = [
  { key: "a", label: "Navy + Gold", swatch: "#d4a853" },
  { key: "b", label: "Slate + Emerald", swatch: "#10b981" },
  { key: "c", label: "Charcoal + Cyan", swatch: "#58a6ff" },
];

export default function ThemeSelector() {
  const [theme, setTheme] = useState<Theme>("a");

  function apply(t: Theme) {
    document.documentElement.setAttribute("data-theme", t);
    setTheme(t);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs mr-1" style={{ color: "var(--text-muted)" }}>
        Theme:
      </span>
      {themes.map((t) => {
        const isActive = theme === t.key;
        return (
          <button
            key={t.key}
            onClick={() => apply(t.key)}
            title={t.label}
            className="w-6 h-6 rounded-full border-2 transition-all"
            style={{
              backgroundColor: t.swatch,
              borderColor: isActive ? "var(--text-primary)" : "transparent",
              transform: isActive ? "scale(1.15)" : "scale(1)",
              opacity: isActive ? 1 : 0.5,
              boxShadow: isActive ? `0 0 8px ${t.swatch}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
