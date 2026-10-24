import { useSyncExternalStore } from "react";

/** Subscribe to a media query, e.g. "(min-width: 768px)". */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
