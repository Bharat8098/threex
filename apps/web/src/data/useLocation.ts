import { useCallback, useState } from "react";
import type { Point } from "./geo.ts";

export type LocationStatus = "idle" | "locating" | "found" | "denied" | "unavailable";

/** The device's position, asked for only when the user taps "Locate me". It is never stored
 * and never sent anywhere: nearby spots are picked on the device. */
export function useLocation() {
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [point, setPoint] = useState<Point>();
  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setStatus("unavailable");
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPoint({ lat: position.coords.latitude, lon: position.coords.longitude });
        setStatus("found");
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  }, []);
  return { status, point, locate };
}
