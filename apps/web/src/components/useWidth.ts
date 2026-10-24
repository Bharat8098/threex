import { type RefObject, useLayoutEffect, useState } from "react";

/** The element's content width in CSS pixels, kept current with a ResizeObserver. */
export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 320): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width) || fallback);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, fallback]);
  return width;
}
