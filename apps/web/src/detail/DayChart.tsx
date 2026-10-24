import { useRef } from "react";
import { cx } from "../components/cx.ts";
import { useWidth } from "../components/useWidth.ts";
import { formatSigned, formatTime } from "../copy/format.ts";
import type { SpotDetail } from "../workers/protocol.ts";
import styles from "./DayChart.module.css";
import { HOUR_MS, type Run, ratingRuns } from "./model.ts";

const CURVE_H = 92;
const LABEL_H = 18;
const RIBBON_H = 8;
const AXIS_H = 18;

export const ratingClass = (rating: number) =>
  rating >= 3 ? styles.r3 : rating === 2 ? styles.r2 : styles.low;

/** "3X 06:15–08:30, 17:45–19:30" for screen readers. */
export function describeRuns(runs: Run[], rating: number): string {
  return runs
    .filter((r) => r.rating === rating)
    .map((r) => `${formatTime(r.from)}–${formatTime(r.to)}`)
    .join(", ");
}

/** The next 24 hours: the tide curve with highs and lows, night shading, and a ribbon of
 * the rating underneath (green 3X, yellow 2X). Freshwater spots show only the ribbon. */
export function DayChart({ detail, hours = 24 }: { detail: SpotDetail; hours?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const { start, stepMs } = detail;
  const end = start + hours * HOUR_MS;
  const count = Math.min(detail.ratings.length, Math.ceil((end - start) / stepMs) + 1);
  const tides = detail.tideCm.slice(0, count);
  const tidal = tides.some((h) => h !== null);
  const top = tidal ? LABEL_H + CURVE_H + LABEL_H : 0;
  const height = top + RIBBON_H + AXIS_H + 6;
  const x = (t: number) => ((t - start) / (end - start)) * width;

  const known = tides.filter((h): h is number => h !== null);
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const pad = Math.max(10, (hi - lo) * 0.1);
  const y = (cm: number) => LABEL_H + CURVE_H - ((cm - lo + pad) / (hi - lo + 2 * pad)) * CURVE_H;
  const points = tides.flatMap((h, i) => (h === null ? [] : [`${x(start + i * stepMs)},${y(h)}`]));
  const line = points.length ? `M${points.join("L")}` : "";
  const area = points.length
    ? `${line}L${x(start + (tides.length - 1) * stepMs)},${LABEL_H + CURVE_H}L0,${LABEL_H + CURVE_H}Z`
    : "";

  const runs = ratingRuns(detail.ratings, start, stepMs, start, end);
  const nights = ratingRuns(
    detail.light.map((l) => (l === "night" ? 1 : 0)),
    start,
    stepMs,
    start,
    end,
  ).filter((r) => r.rating === 1);
  const events = detail.tideEvents.filter((e) => e.t >= start && e.t <= end);
  const ticks: number[] = [];
  for (let t = Math.ceil(start / (3 * HOUR_MS)) * 3 * HOUR_MS; t < end; t += 3 * HOUR_MS) {
    ticks.push(t);
  }

  const summary = [
    describeRuns(runs, 3) && `3X ${describeRuns(runs, 3)}`,
    describeRuns(runs, 2) && `2X ${describeRuns(runs, 2)}`,
    ...events.map((e) => `${e.kind} tide ${formatTime(e.t)}`),
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <div ref={box} className={styles.chart}>
      <svg width={width} height={height} role="img" aria-label={summary || "No 3X or 2X today"}>
        {nights.map((n) => (
          <rect
            key={n.from}
            className={styles.night}
            x={x(n.from)}
            y={0}
            width={x(n.to) - x(n.from)}
            height={top + RIBBON_H}
          />
        ))}
        {tidal && (
          <>
            <path className={styles.area} d={area} />
            <path className={styles.curve} d={line} />
            {events.map((e) => {
              const above = e.kind === "high";
              const cy = y(e.heightCm);
              const cx = Math.min(Math.max(x(e.t), 28), width - 28);
              return (
                <g key={e.t}>
                  <circle className={styles.dot} cx={x(e.t)} cy={cy} r={3.5} />
                  <text
                    className={styles.eventLabel}
                    x={cx}
                    y={above ? cy - 8 : cy + 16}
                    textAnchor="middle"
                  >
                    {formatTime(e.t)} · {formatSigned(e.heightCm / 100, 1)} m
                  </text>
                </g>
              );
            })}
          </>
        )}
        <rect className={styles.track} x={0} y={top} width={width} height={RIBBON_H} rx={4} />
        {runs
          .filter((r) => r.rating >= 2)
          .map((r) => (
            <rect
              key={r.from}
              className={cx(styles.run, ratingClass(r.rating))}
              x={x(r.from)}
              y={top}
              width={Math.max(2, x(r.to) - x(r.from))}
              height={RIBBON_H}
              rx={4}
            />
          ))}
        <line className={styles.now} x1={1} x2={1} y1={0} y2={top + RIBBON_H} />
        {ticks.map((t) => (
          <text
            key={t}
            className={styles.tick}
            x={x(t)}
            y={top + RIBBON_H + 14}
            textAnchor={x(t) < 12 ? "start" : "middle"}
          >
            {formatTime(t)}
          </text>
        ))}
      </svg>
    </div>
  );
}
