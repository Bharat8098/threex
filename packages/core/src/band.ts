import type { Band } from "./generated/contract.ts";

/** Trapezoid membership: 1 inside [idealMin, idealMax], falling linearly to 0 over `falloff`. */
export function membership(value: number, band: Band): number {
  if (value >= band.idealMin && value <= band.idealMax) return 1;
  if (band.falloff <= 0) return 0;
  const distance = value < band.idealMin ? band.idealMin - value : value - band.idealMax;
  return Math.max(0, 1 - distance / band.falloff);
}
