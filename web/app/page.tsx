import { Suspense } from "react";
import { getDashboardData } from "../lib/data";
import Dashboard from "../components/Dashboard";

export const dynamic = "force-dynamic";

function DashboardFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div style={{ color: "var(--text-dim)" }}>Loading...</div>
    </div>
  );
}

export default function Home() {
  const data = getDashboardData();

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <p style={{ color: "var(--text-secondary)" }}>
          No pricing data available yet. Run the scraper first.
        </p>
      </div>
    );
  }

  return (
    <Suspense fallback={<DashboardFallback />}>
      <Dashboard data={data} />
    </Suspense>
  );
}
