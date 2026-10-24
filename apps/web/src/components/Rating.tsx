import { Fish, ShieldChevron, Waves } from "@phosphor-icons/react";
import type { Pillar, PillarStatus } from "@threex/core";
import { strings } from "../copy/strings.ts";
import { cx } from "./cx.ts";
import styles from "./Rating.module.css";

/** "3X" badge: green fill for Recommended, yellow for Worth a look, muted otherwise.
 * Colour is never the only signal: the count is always printed. */
export function RatingBadge({ rating, size = "m" }: { rating?: number; size?: "s" | "m" | "l" }) {
  if (rating === undefined) {
    return (
      <span
        className={cx(styles.badge, styles.low, styles.pending, styles[size])}
        aria-label={strings.rating.pending}
      >
        ·
      </span>
    );
  }
  const tone = rating >= 3 ? styles.r3 : rating === 2 ? styles.r2 : styles.low;
  return (
    <span className={cx(styles.badge, tone, styles[size])} aria-label={strings.rating.aria(rating)}>
      {rating}X
    </span>
  );
}

const ICONS = { comfort: Waves, safety: ShieldChevron, food: Fish } as const;
const PILLARS = ["comfort", "safety", "food"] as const;

export type PillarStatuses = Record<Pillar, PillarStatus>;

/** One pillar's mark: filled in the pillar's colour when earned, outline when missed, dashed
 * when unknown. Decorative unless `label` is set. */
export function PillarIcon({
  pillar,
  status,
  label,
  large,
}: {
  pillar: Pillar;
  status: PillarStatus;
  label?: string;
  large?: boolean;
}) {
  const Icon = ICONS[pillar];
  return (
    <span
      className={cx(styles.mark, large && styles.large, styles[pillar], styles[status])}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <Icon weight={status === "earned" ? "fill" : "regular"} aria-hidden />
    </span>
  );
}

/** The three X's: filled icon when earned, outline when missed, dashed when unknown. */
export function PillarMarks({ statuses }: { statuses: PillarStatuses }) {
  return (
    <span className={styles.marks}>
      {PILLARS.map((p) => (
        <PillarIcon
          key={p}
          pillar={p}
          status={statuses[p]}
          label={`${strings.pillar[p]}: ${strings.pillarStatusShort[statuses[p]]}`}
        />
      ))}
    </span>
  );
}
