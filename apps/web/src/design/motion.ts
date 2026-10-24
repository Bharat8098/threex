import { type Transition, useReducedMotion } from "motion/react";

/** Named springs, mirroring SwiftUI's .smooth, .snappy and .bouncy. */
export const spring = {
  smooth: { type: "spring", stiffness: 260, damping: 30 },
  snappy: { type: "spring", stiffness: 420, damping: 34 },
  bouncy: { type: "spring", stiffness: 320, damping: 18 },
} as const satisfies Record<string, Transition>;

const crossfade: Transition = { duration: 0.15, ease: "linear" };

/** A spring, or a short crossfade when the user prefers reduced motion. */
export function useSpring(name: keyof typeof spring): Transition {
  return useReducedMotion() ? crossfade : spring[name];
}

let probe: HTMLElement | undefined;

/**
 * Resolve a colour token to a concrete rgb() string for the current theme and contrast
 * setting. MapLibre needs real colours; `light-dark()` inside a custom property is only
 * resolved once it lands on a real property, so a hidden probe element does that.
 */
export function color(token: `--${string}`): string {
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.display = "none";
    document.documentElement.append(probe);
  }
  probe.style.color = `var(${token})`;
  return getComputedStyle(probe).color;
}
