"use client";

import { useEffect } from "react";

interface SidebarProps {
  category: "gpu" | "cpu" | "storage" | "networking";
  onChange: (cat: "gpu" | "cpu" | "storage" | "networking") => void;
  gpuCount: number;
  cpuCount: number;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({
  category,
  onChange,
  gpuCount,
  cpuCount,
  open,
  onClose,
}: SidebarProps) {
  const items: {
    key: typeof category;
    label: string;
    count?: number;
    icon: string;
  }[] = [
    { key: "gpu", label: "GPU", count: gpuCount, icon: "▣" },
    { key: "cpu", label: "CPU", count: cpuCount, icon: "□" },
    { key: "storage", label: "Storage", icon: "▤" },
    { key: "networking", label: "Networking", icon: "▥" },
  ];

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function handleClick(cat: typeof category) {
    onChange(cat);
    onClose();
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={onClose}
        />
      )}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40 h-screen w-64 md:w-56 flex-shrink-0 border-r overflow-y-auto
          transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between pt-6 pb-2 px-4 md:px-5">
          <div>
            <h2
              className="text-xs uppercase tracking-[0.15em] font-bold mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Pricing Tracker
            </h2>
            <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
              CoreWeave Cloud
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-lg p-1"
            style={{ color: "var(--text-dim)" }}
          >
            ✕
          </button>
        </div>

        <nav className="mt-3">
          {items.map((item) => {
            const active = category === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleClick(item.key)}
                className="w-full flex items-center gap-3 px-4 md:px-5 py-2.5 text-sm transition-colors border-l-[3px] text-left"
                style={{
                  color: active ? "var(--text-primary)" : "var(--text-dim)",
                  borderLeftColor: active ? "var(--accent)" : "transparent",
                  backgroundColor: active ? "var(--accent-dim)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--text-dim)";
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span
                    className="ml-auto text-xs rounded px-1.5 py-0.5 font-mono"
                    style={{
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mx-4 my-5" style={{ borderTop: "1px solid var(--border-color)" }} />

        <div className="px-4 md:px-5 space-y-1 pb-4">
          <a
            href="https://coreweave.com/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-2 py-1.5 text-xs rounded transition-colors"
            style={{ color: "var(--text-dim)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            Source page &rarr;
          </a>
        </div>
      </aside>
    </>
  );
}
