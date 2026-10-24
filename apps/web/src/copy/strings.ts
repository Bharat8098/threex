// Every piece of user-facing English lives here (reason phrases in reasons.ts), so a
// translation is one new file. Keep sentences short: the app is read outdoors, at a glance.
import type { FeatureKind, Pillar, PillarStatus, TidePhase, WaterType } from "@threex/core";
import { formatDistance, formatNumber, formatSigned } from "./format.ts";

export const strings = {
  appName: "ThreeX",

  rating: {
    label: (rating: number) =>
      rating >= 3 ? "Recommended" : rating === 2 ? "Worth a look" : "Not now",
    aria: (rating: number) => `${strings.rating.label(rating)}: ${rating} of 3`,
    pending: "Rating not ready yet",
  },

  pillar: { comfort: "Comfort", safety: "Safety", food: "Food" } satisfies Record<Pillar, string>,
  pillarStatus: {
    earned: "Earned",
    missed: "Missing",
    unknown: "No data",
  } satisfies Record<PillarStatus, string>,
  pillarStatusShort: { earned: "yes", missed: "no", unknown: "unknown" } satisfies Record<
    PillarStatus,
    string
  >,
  pillarUnknown: "Not enough data to judge right now.",

  water: {
    coastal: "Coastal",
    estuary: "Estuary",
    freshwater: "Freshwater",
  } satisfies Record<WaterType, string>,

  feature: {
    pier: "Pier",
    breakwater: "Breakwater",
    groyne: "Groyne",
    jetty: "Jetty",
    rocks: "Rocks",
    reef: "Reef",
    wreck: "Wreck",
    bridgePilings: "Bridge pilings",
    weir: "Weir",
    dam: "Dam",
    dropOff: "Drop-off",
    channelEdge: "Channel edge",
    riverMouth: "River mouth",
    confluence: "Confluence",
    mangroveEdge: "Mangrove edge",
    weedBed: "Weed bed",
  } satisfies Record<FeatureKind, string>,

  tide: {
    high: "high tide",
    low: "low tide",
    rising: "rising tide",
    falling: "falling tide",
  } satisfies Record<TidePhase, string>,
  light: { night: "night", dawn: "dawn", day: "day", dusk: "dusk" },

  modes: { now: "Now", week: "This week", label: "Show ratings for" },
  controls: {
    locate: "Show spots near me",
    locating: "Finding you…",
    appearance: (preference: string) => `Appearance: ${preference}`,
    about: "About ThreeX and its data",
  },

  list: {
    nearTitle: "Near you",
    weekTitle: "Best this week",
    updating: "Updating…",
    loading: "Loading spots…",
    loadError: (error?: string) => `Couldn't load spots. ${error ?? ""}`.trim(),
    locationOff: (region: string) => `Location is off, so spots near ${region} are shown.`,
    weatherMissing: (count: number) =>
      `Weather didn't load for ${count === 1 ? "1 spot" : `${count} spots`}, so ${
        count === 1 ? "its rating" : "their ratings"
      } may read low.`,
    retry: "Try again",
    best: (when: string) => `Best ${when}`,
    aboutRow: "About ThreeX & data",
  },

  planner: {
    days: "Day",
    empty: "No 3X windows near you this day. Spots marked 2X may still be worth a look.",
    spots: (count: number) => (count === 0 ? "none" : count === 1 ? "1 spot" : `${count} spots`),
    windowDetail: (tide: string | undefined, light: string) =>
      [tide, light].filter(Boolean).join(" · "),
  },

  detail: {
    back: "Back",
    spot: "Spot",
    backTo: (title: string) => `Back to ${title}`,
    directions: "Directions",
    share: "Share",
    shared: "Link copied",
    now: (label: string) => `${label} now`,
    until: (time: string) => `until ${time}`,
    allWeek: "for the rest of the week",
    next3x: (when: string) => `Next 3X: ${when}`,
    no3x: "No 3X window in the next 7 days.",
    flip: (pillar: string, tide: string | undefined, when: string) =>
      `Gets ${pillar}${tide ? ` on the ${tide}` : ""}, ${when}`,
    whyTitle: "Why",
    todayTitle: "Today",
    tideNow: (cm: number, phase: string) => `Tide ${formatSigned(cm / 100, 1)} m, ${phase}`,
    weekTitle: "This week",
    weekLegend: { r3: "3X", r2: "2X", low: "0–1X" },
    weekAria: (day: string, summary: string) => `${day}: ${summary}`,
    windowsTitle: "Best windows",
    conditionsTitle: "Conditions now",
    spotTitle: "About this spot",
    sourcesTitle: "Data",
    notFound: "This spot isn't in the current catalogue.",
    scoring: "Working out the week…",
    disclaimer:
      "Ratings are estimates from open data, not a promise of fish. Check local rules, tides and weather before you go. ThreeX is not for navigation.",
  },

  conditions: {
    wind: "Wind",
    cloud: "Cloud",
    air: "Air",
    water: "Water",
    waves: "Waves",
    current: "Current",
    river: "River flow",
    vsNormal: (delta: number) =>
      Math.abs(delta) < 0.2 ? "usual" : `${formatSigned(delta, 1)} °C vs usual`,
    vsMedian: (ratio: number) => `${ratio.toFixed(1)}× usual`,
    none: "No live conditions for this spot.",
  },

  facts: {
    depth: (m: number) => `About ${formatNumber(m, m < 10 ? 1 : 0)} m deep at mean sea level`,
    noDepth: "Depth unknown",
    feature: (kind: FeatureKind, distanceM: number) =>
      `${strings.feature[kind]}, ${strings.facts.distance(distanceM)}`,
    distance: (m: number) => (m < 10 ? "at the spot" : `${formatDistance(m / 1000)} away`),
    habitat: {
      mangroveM: "Mangroves",
      reefM: "Reef",
      weedBedM: "Weed beds",
      riverMouthM: "River mouth",
    },
    confidence: (c: number) =>
      c >= 0.75 ? "High confidence" : c >= 0.6 ? "Medium confidence" : "Low confidence",
    confidenceHint: "How sure we are of this spot's facts and tides. It doesn't change the rating.",
    coordinates: "Coordinates",
  },

  about: {
    title: "About & Data",
    intro:
      "ThreeX rates fishing spots from public data, not catch reports. A fish settles where three needs are met at once.",
    pillars: {
      comfort: "Water it can hold in without fighting: gentle flow, cool water, low light.",
      safety: "Somewhere to hide from bigger fish: structure, weed lines, mangroves, depth.",
      food: "Something to eat, and a reason to feed: nursery habitat, moving water, dawn and dusk.",
    } satisfies Record<Pillar, string>,
    ratingsTitle: "Ratings",
    ratings: [
      "3X, Recommended: all three needs are met.",
      "2X, Worth a look: one is missing. ThreeX tells you when it flips to 3X.",
      "0–1X: not now.",
    ],
    howTitle: "How it works",
    how: [
      "Ratings are worked out on your device every 15 minutes for the next 7 days.",
      "Tides are predicted 45 days ahead. Weather comes live from Open-Meteo.",
      "Spots come from mapped structures and habitat in OpenStreetMap, rebuilt every week.",
    ],
    creditsTitle: "Data and credits",
    dataVersion: (region: string, built: string) => `${region} · built ${built}`,
    scoringVersion: (version: string) => `Scoring model ${version}`,
    privacyTitle: "Privacy",
    privacy: [
      "No accounts, no ads, no tracking.",
      "Your location never leaves your device. Weather is fetched for spot coordinates, not for you.",
      "ThreeX stores only a cache of spots and forecasts, and your appearance choice.",
    ],
    clear: "Clear saved data",
    cleared: "Saved data cleared",
    sourceTitle: "Open source",
    source: "ThreeX is open source (MIT). The spot catalogue is open data (ODbL).",
    sourceLink: "Code on GitHub",
    disclaimerTitle: "Safety",
  },

  offline: "Offline · showing saved forecasts",
  install: {
    lead: "Add ThreeX to your Home Screen",
    body: " for a full-screen app that works offline: tap ",
    share: "Share",
    then: " then ",
    add: "Add to Home Screen",
    dismiss: "Dismiss",
  },
  map: "Map of fishing spots",
  you: "Your location",
};
