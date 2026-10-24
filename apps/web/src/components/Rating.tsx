import { Fish, ShieldChevron, Waves } from "@phosphor-icons/react";
import type { PillarStatus } from "@threex/core";
import { cx } from "./cx.ts";
import styles from "./Rating.module.css";

const LABELS = ["Not now", "Not now", "Worth a look", "Recommended"] as const;

/** "3X" badge: green fill for Recommended, yellow for Worth a look, muted otherwise.
 * Colour is never the only signal: the count is always printed. */
export function RatingBadge({ rating, size = "m" }: { rating?: number; size?: "s" | "m" | "l" }) {
  if (rating === undefined) {
    return (
      <span
        className={cx(styles.badge, styles.low, styles.pending, styles[size])}
        aria-label="Rating not ready yet"
      >
        ·
      </span>
    );
  }
  const tone = rating >= 3 ? styles.r3 : rating === 2 ? styles.r2 : styles.low;
  return (
    <span
      className={cx(styles.badge, tone, styles[size])}
      aria-label={`${LABELS[rating]}: ${rating} of 3`}
    >
      {rating}X
    </span>
  );
}

export function ratingLabel(rating: number): string {
  return LABELS[rating] ?? LABELS[0];
}

const PILLARS = [
  { id: "comfort", name: "Comfort", Icon: Waves },
  { id: "safety", name: "Safety", Icon: ShieldChevron },
  { id: "food", name: "Food", Icon: Fish },
] as const;

export type PillarStatuses = Record<(typeof PILLARS)[number]["id"], PillarStatus>;

const STATUS_TEXT: Record<PillarStatus, string> = {
  earned: "yes",
  missed: "no",
  unknown: "unknown",
};

/** The three X's: filled icon when earned, outline when missed, dashed when unknown. */
export function PillarMarks({ statuses }: { statuses: PillarStatuses }) {
  return (
    <span className={styles.marks}>
      {PILLARS.map(({ id, name, Icon }) => {
        const status = statuses[id];
        return (
          <span
            key={id}
            className={cx(styles.mark, styles[id], styles[status])}
            role="img"
            aria-label={`${name}: ${STATUS_TEXT[status]}`}
          >
            <Icon weight={status === "earned" ? "fill" : "regular"} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
