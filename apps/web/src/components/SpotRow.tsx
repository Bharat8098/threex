import { memo } from "react";
import { PillarMarks, type PillarStatuses, RatingBadge } from "./Rating.tsx";
import styles from "./SpotRow.module.css";

export interface SpotRowProps {
  /** The spot's id: passed to `onSelect`, and set as `data-spot` for tests and screenshots. */
  id?: string;
  name: string;
  detail: string;
  rating?: number;
  statuses: PillarStatuses;
  best?: string;
  selected?: boolean;
  onSelect?: (id?: string) => void;
}

/** One spot in the list. Memoised: a long list re-renders only the rows that changed. */
export const SpotRow = memo(function SpotRow({
  id,
  name,
  detail,
  rating,
  statuses,
  best,
  selected,
  onSelect,
}: SpotRowProps) {
  return (
    <button
      type="button"
      className={`pressable ${styles.row}`}
      data-spot={id}
      aria-current={selected || undefined}
      onClick={() => onSelect?.(id)}
    >
      <span className={styles.text}>
        <span className={`t-headline ${styles.name}`}>{name}</span>
        <span className="t-subheadline secondary">{detail}</span>
        <span className={styles.meta}>
          <PillarMarks statuses={statuses} />
          {best && <span className={`t-footnote secondary tabular ${styles.best}`}>{best}</span>}
        </span>
      </span>
      <RatingBadge rating={rating} />
    </button>
  );
});
