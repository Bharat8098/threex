import { motion } from "motion/react";
import { RatingBadge } from "../components/Rating.tsx";
import { cx } from "../components/cx.ts";
import type { NearbySpot } from "../data/catalogue.ts";
import { useSpring } from "../design/motion.ts";
import { dayLabel, formatDistance, formatTime, formatWindow } from "../copy/format.ts";
import { strings } from "../copy/strings.ts";
import { bestWindowsOnDay } from "../detail/model.ts";
import type { SpotScore } from "../workers/protocol.ts";
import styles from "./WeekPlanner.module.css";

const dateLabel = new Intl.DateTimeFormat(undefined, { day: "numeric" });

interface Props {
  days: number[];
  day: number;
  onDay: (day: number) => void;
  scores: Map<string, SpotScore>;
  nearby: NearbySpot[];
  onSelect: (spotId: string) => void;
}

/** "This week": pick a day, see every spot that reaches 3X that day, each at its best
 * window, best first. */
export function WeekPlanner({ days, day, onDay, scores, nearby, onSelect }: Props) {
  const transition = useSpring("snappy");
  const byId = new Map(nearby.map((n) => [n.spot.id, n]));
  const windows = bestWindowsOnDay(scores.values(), day).filter((w) => byId.has(w.spotId));
  return (
    <div className={styles.planner}>
      <div className={styles.strip} role="radiogroup" aria-label={strings.planner.days}>
        {days.map((d) => {
          const selected = d === day;
          const count = bestWindowsOnDay(scores.values(), d).length;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cx(styles.day, selected && styles.selected)}
              onClick={() => onDay(d)}
            >
              {selected && (
                <motion.span
                  layoutId="planner-day"
                  className={styles.dayFill}
                  transition={transition}
                />
              )}
              <span className={cx("t-footnote", styles.dayName)}>{dayLabel(d, days[0])}</span>
              <span className={cx("t-headline tabular", styles.dayDate)}>
                {dateLabel.format(d)}
              </span>
              <span className={cx("t-caption2", styles.count)}>{strings.planner.spots(count)}</span>
            </button>
          );
        })}
      </div>

      {windows.length === 0 ? (
        <p className="t-subheadline secondary">{strings.planner.empty}</p>
      ) : (
        <ol className={styles.list}>
          {windows.map((w) => {
            const near = byId.get(w.spotId)!;
            return (
              <li key={`${w.spotId}-${w.start}`}>
                <button
                  type="button"
                  className={cx("pressable", styles.row)}
                  onClick={() => onSelect(w.spotId)}
                  aria-label={`${formatWindow(w.start, w.end)}, ${near.spot.name}`}
                >
                  <span className={cx("t-headline tabular", styles.time)}>
                    {formatTime(w.start)}
                    <span className="secondary">–{formatTime(w.end)}</span>
                  </span>
                  <span className={styles.text}>
                    <span className="t-headline">{near.spot.name}</span>
                    <span className="t-subheadline secondary">
                      {[
                        strings.planner.windowDetail(
                          w.tidePhase && strings.tide[w.tidePhase],
                          strings.light[w.light],
                        ),
                        formatDistance(near.distanceKm),
                      ].join(" · ")}
                    </span>
                  </span>
                  <RatingBadge rating={3} size="s" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
