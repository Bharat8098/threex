import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../design/motion.ts";
import { cx } from "./cx.ts";
import styles from "./Sheet.module.css";
import { useMedia } from "./useMedia.ts";

export type Detent = "peek" | "half" | "full";
const ORDER: Detent[] = ["peek", "half", "full"];
/** The peek detent shows the header and the first row, so it grows with the text size. */
const PEEK_REM = 11.5;

export function peekPx(): number {
  return Math.round(PEEK_REM * parseFloat(getComputedStyle(document.documentElement).fontSize));
}

interface Props {
  title: ReactNode;
  accessory?: ReactNode;
  children: ReactNode;
  detent?: Detent;
  onDetentChange?: (detent: Detent) => void;
}

/**
 * A draggable bottom sheet with peek / half / full detents on phones, and a fixed side
 * panel on iPad and desktop. Drag from the header; the list scrolls on its own. Velocity
 * decides where a flick lands. Reduced motion snaps without the spring.
 */
export function Sheet({
  title,
  accessory,
  children,
  detent: wanted = "peek",
  onDetentChange,
}: Props) {
  const wide = useMedia("(min-width: 768px)");
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const y = useMotionValue(0);
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  const [top, setTop] = useState(64);
  const [peek, setPeek] = useState(196);
  const sheet = useRef<HTMLElement>(null);
  const [detent, setDetent] = useState<Detent>(wanted);
  const headerId = useRef(`sheet-${Math.random().toString(36).slice(2)}`).current;

  useLayoutEffect(() => {
    const update = () => {
      setHeight(window.visualViewport?.height ?? window.innerHeight);
      if (sheet.current) setTop(sheet.current.offsetTop); // below the top controls and safe area
      setPeek(peekPx());
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [wide]);

  const full = height - top;
  const offsets: Record<Detent, number> = {
    full: 0,
    half: full - Math.round(height * 0.5),
    peek: full - peek,
  };

  const settle = (next: Detent) => {
    setDetent(next);
    onDetentChange?.(next);
    animate(y, offsets[next], reduced ? { duration: 0 } : spring.smooth);
  };

  useEffect(() => setDetent(wanted), [wanted]);
  useEffect(() => {
    if (!wide) animate(y, offsets[detent], reduced ? { duration: 0 } : spring.smooth);
  }, [detent, height, peek, wide]);

  if (wide) {
    return (
      <aside className={styles.panel} aria-labelledby={headerId}>
        <header className={styles.panelHeader}>
          <h2 id={headerId} className="t-title2">
            {title}
          </h2>
          {accessory}
        </header>
        <div className={styles.scroll}>{children}</div>
      </aside>
    );
  }

  const step = (direction: 1 | -1) => {
    const index = Math.min(2, Math.max(0, ORDER.indexOf(detent) + direction));
    settle(ORDER[index]!);
  };

  return (
    <motion.section
      ref={sheet}
      className={styles.sheet}
      style={{ y, height: full }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: offsets.peek }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const projected = y.get() + info.velocity.y * 0.2;
        const nearest = ORDER.reduce((a, b) =>
          Math.abs(offsets[b] - projected) < Math.abs(offsets[a] - projected) ? b : a,
        );
        settle(nearest);
      }}
      aria-labelledby={headerId}
    >
      <header className={cx("glass", styles.header)} onPointerDown={(e) => controls.start(e)}>
        <button
          type="button"
          className={styles.grabber}
          aria-label={detent === "full" ? "Collapse list" : "Expand list"}
          aria-expanded={detent !== "peek"}
          onClick={() => step(detent === "full" ? -1 : 1)}
        />
        <div className={styles.titleRow}>
          <h2 id={headerId} className="t-title3">
            {title}
          </h2>
          {accessory}
        </div>
      </header>
      <div className={styles.scroll} data-detent={detent}>
        {children}
      </div>
    </motion.section>
  );
}
