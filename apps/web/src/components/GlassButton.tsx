import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useSpring } from "../design/motion.ts";
import { cx } from "./cx.ts";
import styles from "./GlassButton.module.css";

interface Props {
  label: string;
  onClick?: () => void;
  pressed?: boolean;
  children: ReactNode;
  /** Inside a GlassGroup the group draws the glass; the button stays clear. */
  bare?: boolean;
}

/** A 44 pt round icon button on the control layer. */
export function GlassButton({ label, onClick, pressed, children, bare }: Props) {
  const transition = useSpring("snappy");
  return (
    <motion.button
      type="button"
      className={cx(styles.button, !bare && "glass", pressed && styles.pressed)}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      transition={transition}
    >
      {children}
    </motion.button>
  );
}

/** Related controls share one piece of glass (never glass on glass). */
export function GlassGroup({ children, vertical }: { children: ReactNode; vertical?: boolean }) {
  return <div className={cx("glass", styles.group, vertical && styles.vertical)}>{children}</div>;
}
