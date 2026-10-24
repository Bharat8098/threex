// Turns the engine's reason codes into short phrases ("Breakwater 15 m away"). The engine
// says which signal helped or hurt; the band from the scoring config says whether a weak
// signal was too low or too high (still air vs a gale). Nothing here scores.
import type { Band, FeatureKind, PillarResult, Reason, TidePhase } from "@threex/core";
import { formatNumber, formatSigned } from "./format.ts";
import { strings } from "./strings.ts";

type Side = "low" | "high";

function side(reason: Reason, band: Band | undefined): Side {
  if (!band) return "high";
  return reason.value < band.idealMin ? "low" : "high";
}

const kmh = (ms: number) => `${formatNumber(ms * 3.6)} km/h`;
const num = (detail: Reason["detail"], key: string) =>
  typeof detail?.[key] === "number" ? (detail[key] as number) : undefined;
const str = (detail: Reason["detail"], key: string) =>
  typeof detail?.[key] === "string" ? (detail[key] as string) : undefined;

const HABITAT: Record<string, string> = {
  mangrove: "Mangroves nearby",
  weedBed: "Weed beds nearby",
  reef: "Reef nearby",
  riverMouth: "River mouth nearby",
};

/** One phrase for one reason. */
export function describeReason(reason: Reason, band?: Band): string {
  const good = reason.polarity === "positive";
  const { value, detail } = reason;
  switch (reason.signal) {
    case "tidalFlow":
      return good ? "Gentle tidal flow" : "Strong tidal flow";
    case "currentSpeed":
      return good ? "Gentle current" : `Strong current (${kmh(value)})`;
    case "waterTempAnomaly":
      if (good)
        return value <= -0.3
          ? `Water ${formatNumber(-value, 1)} °C cooler than usual`
          : "Water near its usual temperature";
      return side(reason, band) === "low"
        ? "Water unusually cold"
        : `Water ${formatNumber(value, 1)} °C warmer than usual`;
    case "lightLevel": {
      if (!good) return "Bright sun";
      const altitude = num(detail, "sunAltitude") ?? 0;
      const cloud = num(detail, "cloud") ?? 0;
      if (altitude <= -6) return "Dark: low light";
      if (altitude <= 10) return "Low sun";
      return cloud >= 0.6 ? "Overcast: low light" : "Soft light";
    }
    case "windSpeed":
      if (good) return `Light breeze (${kmh(value)})`;
      return side(reason, band) === "low" ? "Still air" : `Strong wind (${kmh(value)})`;
    case "waveHeight":
      return good
        ? `Calm water (${formatNumber(value, 1)} m waves)`
        : `Rough sea (${formatNumber(value, 1)} m waves)`;
    case "dischargeRatio":
      if (good) return "River at its usual flow";
      return side(reason, band) === "low"
        ? "River running low"
        : `River running high (${formatNumber(value, 1)}× usual)`;
    case "cover": {
      const kind = str(detail, "kind") as FeatureKind | undefined;
      const distance = num(detail, "distanceM");
      if (good && kind && distance !== undefined)
        return `${strings.feature[kind]} ${strings.facts.distance(distance)}`;
      if (!good && num(detail, "dryFeatures")) return "Mangroves still dry";
      return good ? "Good cover nearby" : "Little cover nearby";
    }
    case "waterDepth":
      if (good) return `Good depth (${formatNumber(value, value < 10 ? 1 : 0)} m)`;
      return side(reason, band) === "low"
        ? `Shallow (${formatNumber(value, 1)} m)`
        : `Open, deep water (${formatNumber(value)} m)`;
    case "nurseryHabitat":
      return good
        ? (HABITAT[str(detail, "habitat") ?? ""] ?? "Nursery habitat nearby")
        : "Little nursery habitat nearby";
    case "chlorophyll":
      if (good) return "Productive water";
      return side(reason, band) === "low" ? "Low-nutrient water" : "Algae-heavy water";
    case "tideMovement": {
      const phase = str(detail, "phase") as TidePhase | undefined;
      if (good)
        return phase === "falling" ? "Falling tide, water moving" : "Rising tide, water moving";
      return (num(detail, "minutesSinceTurn") ?? 0) < 30
        ? "Slack water at the turn"
        : "Tide easing before the turn";
    }
    case "lowLightFeeding":
      if (!good) return "Midday: few fish feeding";
      return str(detail, "event") === "sunset" ? "Dusk feeding time" : "Dawn feeding time";
    case "pressureTrend":
      if (good) return `Pressure falling gently (${formatSigned(value, 1)} hPa)`;
      if (side(reason, band) === "low") return "Pressure falling fast";
      return value >= 0.5 ? "Pressure rising" : "Pressure steady";
    case "solunar": {
      if (!good) return "Between solunar periods";
      const event = str(detail, "event");
      return event === "moonrise" || event === "moonset"
        ? "Minor solunar period"
        : "Major solunar period";
    }
  }
}

/** The one or two phrases that best explain a pillar: what helped if it was earned, what
 * held it back if it wasn't. */
export function pillarSummary(
  result: Pick<PillarResult, "status" | "reasons">,
  band: (reason: Reason) => Band | undefined,
  limit = 2,
): string[] {
  if (result.status === "unknown") return [strings.pillarUnknown];
  const lead = result.status === "earned" ? "positive" : "negative";
  const ordered = [
    ...result.reasons.filter((r) => r.polarity === lead),
    ...result.reasons.filter((r) => r.polarity !== lead),
  ];
  return ordered.slice(0, limit).map((r) => describeReason(r, band(r)));
}
