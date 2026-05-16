/* Placement Stability Sparkline (Iteration 42b)
 *
 * Inline mini line-chart of weekly stability scores. Deterministic, no D3.
 * Colour-coded by status band of the most recent week. Hover/touch reveals
 * the week label + score + status. Designed for clarity at glance.
 */
import { useMemo, useState } from "react";

// Status band colour aligned with PlacementStabilityCard
const STATUS_COLOR = {
  stabilising:   "#2F6A3A",
  improving:     "#2F6A3A",
  steady:        "#5D6068",
  watch:         "#B8772F",
  deteriorating: "#A8273A",
  critical:      "#5A0E1C",
  new_placement: "#5D6068",
  fluctuating:   "#B8772F",
  insufficient_data: "#9CA3AF",
  no_admission:  "#9CA3AF",
};

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

export default function StabilitySparkline({
  points = [],
  trajectoryLabel = "steady",
  width = 160,
  height = 44,
  showAxis = true,
  testid = "stability-sparkline",
}) {
  const [hover, setHover] = useState(null);

  const { coords, maxScore, lineColor } = useMemo(() => {
    if (!points || points.length === 0) {
      return { coords: [], maxScore: 0, lineColor: STATUS_COLOR.insufficient_data };
    }
    const scores = points.map((p) => p.score || 0);
    const max = Math.max(8, ...scores); // floor so flat-zero series shows mid-low
    const pad = 4;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const step = points.length > 1 ? w / (points.length - 1) : w / 2;
    const c = points.map((p, i) => {
      const x = pad + i * step;
      const y = pad + h - (p.score / max) * h;
      return { x, y, p, i };
    });
    return {
      coords: c,
      maxScore: max,
      lineColor: STATUS_COLOR[trajectoryLabel] || STATUS_COLOR.steady,
    };
  }, [points, trajectoryLabel, width, height]);

  if (!points || points.length === 0) {
    return (
      <div
        className="text-[10px] text-stone-400 italic"
        data-testid={`${testid}-empty`}
      >
        Building trajectory…
      </div>
    );
  }

  const pathD = coords.map((c, i) => (i === 0 ? `M${c.x},${c.y}` : `L${c.x},${c.y}`)).join(" ");
  const areaD = `${pathD} L${coords[coords.length - 1].x},${height - 4} L${coords[0].x},${height - 4} Z`;

  return (
    <div className="relative inline-block" data-testid={testid}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Weekly stability score trajectory (${points.length} weeks)`}
        style={{ overflow: "visible" }}
      >
        {/* Soft baseline */}
        {showAxis && (
          <line
            x1={4} x2={width - 4} y1={height - 4} y2={height - 4}
            stroke="#E7E5E4" strokeWidth={1}
          />
        )}
        {/* Filled area for visual weight */}
        <path d={areaD} fill={lineColor} fillOpacity={0.12} />
        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Points (small dots, last one larger) */}
        {coords.map((c) => {
          const isLast = c.i === coords.length - 1;
          const dotColor = STATUS_COLOR[c.p.status] || lineColor;
          return (
            <g key={c.i}>
              <circle
                cx={c.x} cy={c.y}
                r={isLast ? 3.5 : 2.2}
                fill={isLast ? dotColor : "#FFFFFF"}
                stroke={dotColor}
                strokeWidth={isLast ? 1 : 1.4}
              />
              {/* Hover hitbox */}
              <circle
                cx={c.x} cy={c.y} r={8}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(c.i)}
                onMouseLeave={() => setHover(null)}
                data-testid={`${testid}-point-${c.i}`}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null && coords[hover] && (
        <div
          className="absolute z-10 bg-[#0F1115] text-white text-[10px] rounded px-1.5 py-1 shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: Math.max(0, Math.min(width - 90, coords[hover].x - 45)),
            top: -28,
          }}
          data-testid={`${testid}-tooltip`}
        >
          <div className="font-semibold">
            {fmtDate(coords[hover].p.week_ending_at)} · score {coords[hover].p.score}
          </div>
          <div className="opacity-70">{coords[hover].p.status_label}</div>
        </div>
      )}
    </div>
  );
}
