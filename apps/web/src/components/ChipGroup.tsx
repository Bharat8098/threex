import { LayoutGroup, motion } from "motion/react";
import { useId } from "react";
import { useSpring } from "../design/motion.ts";
import styles from "./ChipGroup.module.css";

export interface Chip<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  chips: readonly Chip<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A segmented control in one piece of glass; the selection morphs between chips. */
export function ChipGroup<T extends string>({ label, chips, value, onChange }: Props<T>) {
  const group = useId();
  const transition = useSpring("smooth");
  return (
    <LayoutGroup id={group}>
      <div className={`glass ${styles.group}`} role="radiogroup" aria-label={label}>
        {chips.map((chip) => {
          const selected = chip.id === value;
          return (
            <button
              key={chip.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={styles.chip}
              onClick={() => onChange(chip.id)}
            >
              {selected && (
                <motion.span
                  layoutId="selection"
                  className={styles.selection}
                  transition={transition}
                />
              )}
              <span className={styles.label}>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
