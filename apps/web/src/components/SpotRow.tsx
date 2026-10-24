import { motion } from "motion/react";
import { useSpring } from "../design/motion.ts";
import { PillarMarks, type PillarStatuses, RatingBadge } from "./Rating.tsx";
import styles from "./SpotRow.module.css";

export interface SpotRowProps {
  name: string;
  detail: string;
  rating?: number;
  statuses: PillarStatuses;
  best?: string;
  selected?: boolean;
  onSelect?: () => void;
}

export function SpotRow({
  name,
  detail,
  rating,
  statuses,
  best,
  selected,
  onSelect,
}: SpotRowProps) {
  const transition = useSpring("snappy");
  return (
    <motion.button
      type="button"
      className={styles.row}
      aria-current={selected || undefined}
      onClick={onSelect}
      whileTap={{ scale: 0.98 }}
      transition={transition}
      layout="position"
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
    </motion.button>
  );
}
