import { CircleHalf, Crosshair, Moon, Sun } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ChipGroup } from "../components/ChipGroup.tsx";
import { GlassButton, GlassGroup } from "../components/GlassButton.tsx";
import { InstallHint, OfflineBanner } from "../components/Notice.tsx";
import { type Detent, Sheet, peekPx } from "../components/Sheet.tsx";
import { SpotRow } from "../components/SpotRow.tsx";
import { useMedia } from "../components/useMedia.ts";
import { useAppearance } from "../data/appearance.ts";
import { useLocation } from "../data/useLocation.ts";
import { useSpots } from "../data/useSpots.ts";
import { type MapSpot, MapView } from "../map/MapView.tsx";
import type { SpotScore } from "../workers/protocol.ts";
import styles from "./App.module.css";
import { WATER, formatDistance, formatWindow } from "./format.ts";

type Mode = "now" | "week";
const MODES = [
  { id: "now", label: "Now" },
  { id: "week", label: "This week" },
] as const;

/** The rating a spot shows: right now, or the best it reaches this week. */
function displayRating(score: SpotScore | undefined, mode: Mode): number {
  if (!score) return 0;
  if (mode === "now") return score.now.rating;
  return score.windows.length ? 3 : score.flips.length ? 2 : score.now.rating;
}

const UNKNOWN = { comfort: "unknown", safety: "unknown", food: "unknown" } as const;

export function App() {
  const appearance = useAppearance();
  const location = useLocation();
  const state = useSpots(location.point);
  const wide = useMedia("(min-width: 768px)");
  const [mode, setMode] = useState<Mode>("now");
  const [selected, setSelected] = useState<string>();
  const [detent, setDetent] = useState<Detent>("peek");

  const rows = useMemo(() => {
    return state.nearby
      .map((nearby) => ({ ...nearby, score: state.scores.get(nearby.spot.id) }))
      .sort((a, b) => {
        const rating = displayRating(b.score, mode) - displayRating(a.score, mode);
        const best = (b.score?.windows[0]?.score ?? 0) - (a.score?.windows[0]?.score ?? 0);
        return rating || best || a.distanceKm - b.distanceKm;
      });
  }, [state.nearby, state.scores, mode]);

  const mapSpots: MapSpot[] = rows.map(({ spot, score }) => ({
    id: spot.id,
    point: spot.coordinate,
    rating: score ? displayRating(score, mode) : undefined,
    name: spot.name,
  }));

  const select = (id: string) => {
    setSelected(id);
    if (!wide && detent === "peek") setDetent("half");
    requestAnimationFrame(() =>
      document.getElementById(`spot-${id}`)?.scrollIntoView({ block: "nearest" }),
    );
  };

  const ThemeIcon =
    appearance.preference === "system"
      ? CircleHalf
      : appearance.preference === "light"
        ? Sun
        : Moon;
  const sheetPadding = wide
    ? 0
    : detent === "peek"
      ? peekPx()
      : Math.round(window.innerHeight * 0.5);

  return (
    <div className={styles.app} data-wide={wide || undefined}>
      <MapView
        centre={state.centre}
        spots={mapSpots}
        selected={selected}
        onSelect={select}
        scheme={appearance.scheme}
        padding={{ bottom: sheetPadding, left: wide ? 420 : 0 }}
        you={location.point}
      />

      <div className={styles.top}>
        <div className={styles.lead}>
          <div className={`glass ${styles.title}`}>
            <span className="t-headline">ThreeX</span>
            {state.regionName && (
              <span className="t-subheadline secondary">{state.regionName}</span>
            )}
          </div>
          <ChipGroup label="Show ratings for" chips={MODES} value={mode} onChange={setMode} />
        </div>
        <GlassGroup vertical>
          <GlassButton
            bare
            label={location.status === "locating" ? "Finding you…" : "Show spots near me"}
            pressed={location.status === "found"}
            onClick={location.locate}
          >
            <Crosshair weight={location.status === "found" ? "bold" : "regular"} aria-hidden />
          </GlassButton>
          <GlassButton
            bare
            label={`Appearance: ${appearance.preference}`}
            onClick={appearance.cycle}
          >
            <ThemeIcon aria-hidden />
          </GlassButton>
        </GlassGroup>
      </div>

      <div className={styles.banner}>
        <OfflineBanner />
      </div>

      <Sheet
        title={mode === "now" ? "Near you" : "Best this week"}
        accessory={
          state.scoring ? <span className="t-footnote secondary">Updating…</span> : undefined
        }
        detent={detent}
        onDetentChange={setDetent}
      >
        <InstallHint />
        {location.status === "denied" && (
          <p className="t-footnote secondary">
            Location is off, so spots near {state.regionName ?? "the region"} are shown.
          </p>
        )}
        {state.status === "error" && (
          <p className="t-callout" role="alert">
            Couldn't load spots. {state.error}
          </p>
        )}
        {state.status === "loading" && <p className="t-callout secondary">Loading spots…</p>}
        {state.incomplete > 0 && (
          <p className={`t-footnote secondary ${styles.note}`}>
            Weather didn't load for{" "}
            {state.incomplete === 1 ? "1 spot" : `${state.incomplete} spots`}, so
            {state.incomplete === 1 ? " its rating" : " their ratings"} may read low.{" "}
            <button type="button" className={styles.link} onClick={state.retryConditions}>
              Try again
            </button>
          </p>
        )}
        <div className={styles.list}>
          {rows.map(({ spot, score, distanceKm }) => (
            <div key={spot.id} id={`spot-${spot.id}`}>
              <SpotRow
                name={spot.name}
                detail={[spot.locality, WATER[spot.waterType], formatDistance(distanceKm)]
                  .filter(Boolean)
                  .join(" · ")}
                rating={score ? displayRating(score, mode) : undefined}
                statuses={score?.now.statuses ?? UNKNOWN}
                best={
                  score?.windows[0]
                    ? `Best ${formatWindow(score.windows[0].start, score.windows[0].end)}`
                    : undefined
                }
                selected={spot.id === selected}
                onSelect={() => select(spot.id)}
              />
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
