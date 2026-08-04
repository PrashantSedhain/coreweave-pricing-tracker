import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoreWeave Pricing Tracker",
  description: "Track CoreWeave cloud pricing changes over time by region",
};

const THEME_CSS = `
  html[data-theme="a"] {
    --bg-primary: #0d1117;
    --bg-surface: #161b22;
    --bg-tertiary: #21262d;
    --border-color: #30363d;
    --border-color-strong: #484f58;
    --accent: #58a6ff;
    --accent-hover: #79b8ff;
    --accent-dim: rgba(88,166,255,0.1);
    --accent-border: rgba(88,166,255,0.35);
    --text-primary: #c9d1d9;
    --text-dim: #8b949e;
    --text-muted: #484f58;
    --success: #3fb950;
    --danger: #f85149;
  }
  html[data-theme="b"] {
    --bg-primary: #0a1628;
    --bg-surface: #132238;
    --bg-tertiary: #1a3050;
    --border-color: rgba(212,168,83,0.15);
    --border-color-strong: rgba(212,168,83,0.3);
    --accent: #d4a853;
    --accent-hover: #e0be6a;
    --accent-dim: rgba(212,168,83,0.1);
    --accent-border: rgba(212,168,83,0.35);
    --text-primary: #e8e0d5;
    --text-dim: #a09580;
    --text-muted: #6b6055;
    --success: #4ade80;
    --danger: #f87171;
  }
  html[data-theme="c"] {
    --bg-primary: #0f172a;
    --bg-surface: #1e293b;
    --bg-tertiary: #334155;
    --border-color: rgba(16,185,129,0.12);
    --border-color-strong: rgba(16,185,129,0.25);
    --accent: #10b981;
    --accent-hover: #34d399;
    --accent-dim: rgba(16,185,129,0.1);
    --accent-border: rgba(16,185,129,0.35);
    --text-primary: #e2e8f0;
    --text-dim: #94a3b8;
    --text-muted: #64748b;
    --success: #34d399;
    --danger: #f87171;
  }
  body {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
  }
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="a" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
