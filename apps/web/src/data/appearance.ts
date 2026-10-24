import { useEffect, useState, useSyncExternalStore } from "react";

export type Appearance = "system" | "light" | "dark";
const KEY = "threex-appearance";
const ORDER: Appearance[] = ["system", "light", "dark"];

function read(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function apply(value: Appearance): void {
  if (value === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
}

/** Apply the saved appearance before React renders, so there is no flash. */
export function applySavedAppearance(): void {
  apply(read());
}

function systemDark(): boolean {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The appearance preference (the only thing ThreeX stores besides its cache), and the scheme
 * actually in effect. */
export function useAppearance() {
  const [preference, setPreference] = useState<Appearance>(read);
  const dark = useSyncExternalStore(
    (notify) => {
      const list = matchMedia("(prefers-color-scheme: dark)");
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    systemDark,
    () => false,
  );
  useEffect(() => {
    try {
      if (preference === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      // Private browsing: the choice lasts for this visit only.
    }
    apply(preference);
  }, [preference]);
  const scheme: "light" | "dark" = preference === "system" ? (dark ? "dark" : "light") : preference;
  const cycle = () => setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]!);
  return { preference, scheme, cycle };
}
