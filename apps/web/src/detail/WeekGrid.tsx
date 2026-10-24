import { useRef } from "react";
import { cx } from "../components/cx.ts";
import { useWidth } from "../components/useWidth.ts";
import { dayLabel } from "../copy/format.ts";
import { strings } from "../copy/strings.ts";
import type { SpotDetail } from "../workers/protocol.ts";
import { describeRuns, ratingClass } from "./DayChart.tsx";
import styles from "./WeekGrid.module.css";
import { DAY_MS, days, ratingRuns } from "./model.ts";

const ROW_H = 14;
const GAP = 10;
const HOURS = [0, 6, 12, 18, 24];

/** Seven days, one ribbon each from midnight to midnight: when this spot is 3X or 2X. */
export function WeekGrid({ detail }: { detail: SpotDetail }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const { start, stepMs, ratings } = detail;
  const rows = days(start, 7);
  const height = rows.length * (ROW_H + GAP);

  return (
    <div className={styles.grid}>
      <div className={styles.labels} aria-hidden>
        {rows.map((day) => (
          <span key={day} className="t-footnote secondary" style={{ height: ROW_H + GAP }}>
            {dayLabel(day, start)}
          </span>
        ))}
      </div>
      <div ref={box} className={styles.plot}>
        <svg width={width} height={height + 16} role="list">
          {rows.map((day, row) => {
            const next = rows[row + 1] ?? day + DAY_MS;
            const x = (t: number) => ((t - day) / (next - day)) * width;
            const runs = ratingRuns(ratings, start, stepMs, day, next);
            const y = row * (ROW_H + GAP);
            const r3 = describeRuns(runs, 3);
            const label = strings.detail.weekAria(
              dayLabel(day, start),
              [r3 && `3X ${r3}`, describeRuns(runs, 2) && `2X ${describeRuns(runs, 2)}`]
                .filter(Boolean)
                .join("; ") || strings.detail.weekLegend.low,
            );
            return (
              <g key={day} role="listitem" aria-label={label}>
                <rect className={styles.track} x={0} y={y} width={width} height={ROW_H} rx={4} />
                {runs
                  .filter((r) => r.rating >= 2)
                  .map((r) => (
                    <rect
                      key={r.from}
                      className={ratingClass(r.rating)}
                      x={x(r.from)}
                      y={y}
                      width={Math.max(2, x(r.to) - x(r.from))}
                      height={ROW_H}
                      rx={3}
                    />
                  ))}
              </g>
            );
          })}
          {HOURS.map((h) => (
            <text
              key={h}
              className={styles.tick}
              x={(h / 24) * width}
              y={height + 10}
              textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
              aria-hidden
            >
              {String(h).padStart(2, "0")}
            </text>
          ))}
        </svg>
      </div>
      <ul className={cx("t-footnote", styles.legend)} aria-hidden>
        <li>
          <span className={cx(styles.swatch, styles.r3)} /> {strings.detail.weekLegend.r3}
        </li>
        <li>
          <span className={cx(styles.swatch, styles.r2)} /> {strings.detail.weekLegend.r2}
        </li>
        <li>
          <span className={cx(styles.swatch, styles.low)} /> {strings.detail.weekLegend.low}
        </li>
      </ul>
    </div>
  );
}
