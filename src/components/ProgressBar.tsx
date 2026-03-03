import { CSSProperties } from "react";

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  const containerStyle: CSSProperties = {
    width: "100%",
    height: "8px",
    backgroundColor: "#23262e",
    borderRadius: "4px",
    overflow: "hidden",
    marginTop: "4px",
    marginBottom: "4px",
  };

  const fillStyle: CSSProperties = {
    width: `${pct}%`,
    height: "100%",
    backgroundColor: "#1a9fff",
    borderRadius: "4px",
    transition: "width 0.3s ease",
  };

  return (
    <div>
      {label && (
        <div style={{ fontSize: "12px", color: "#dcdedf", marginBottom: "2px" }}>
          {label} — {pct.toFixed(1)}%
        </div>
      )}
      <div style={containerStyle}>
        <div style={fillStyle} />
      </div>
    </div>
  );
}
