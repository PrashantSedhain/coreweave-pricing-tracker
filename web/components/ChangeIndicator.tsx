interface ChangeIndicatorProps {
  current: number | null;
  previous: number | null;
}

export default function ChangeIndicator({
  current,
  previous,
}: ChangeIndicatorProps) {
  if (current === null || previous === null) return null;

  const diff = current - previous;
  if (diff === 0) return <span className="text-gray-500 text-xs">-</span>;

  const pct = ((diff / previous) * 100).toFixed(1);
  const isUp = diff > 0;

  return (
    <span
      className={`text-xs font-medium ${
        isUp ? "text-red-400" : "text-green-400"
      }`}
    >
      {isUp ? "+" : ""}
      {diff.toFixed(2)} ({isUp ? "+" : ""}
      {pct}%)
    </span>
  );
}
