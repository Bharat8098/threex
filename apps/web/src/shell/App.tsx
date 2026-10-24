import { CircleHalf, Crosshair, Info, Moon, Sun } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { About } from "../about/About.tsx";
import { ChipGroup } from "../components/ChipGroup.tsx";
import { GlassButton, GlassGroup } from "../components/GlassButton.tsx";
import { InstallHint, OfflineBanner } from "../components/Notice.tsx";
import { type Detent, Sheet, peekPx } from "../components/Sheet.tsx";
import { SpotRow } from "../components/SpotRow.tsx";
import { useMedia } from "../components/useMedia.ts";
import { formatDistance, formatWindow } from "../copy/format.ts";
import { strings } from "../copy/strings.ts";
import { useAppearance } from "../data/appearance.ts";
import { useLocation } from "../data/useLocation.ts";
import { useSpotDetail, useSpots } from "../data/useSpots.ts";
import { spring } from "../design/motion.ts";
import { SpotDetail } from "../detail/SpotDetail.tsx";
import { bestOnDay, days as nextDays, startOfDay } from "../detail/model.ts";
import { type MapSpot, MapView } from "../map/MapView.tsx";
import { WeekPlanner } from "../planner/WeekPlanner.tsx";
import type { SpotScore } from "../workers/protocol.ts";
import styles from "./App.module.css";
import { routePath, useRoute } from "./route.ts";

type Mode = "now" | "week";
const MODES = [
  { id: "now", label: strings.modes.now },
  { id: "week", label: strings.modes.week },
] as const;

/** The rating a spot shows: right now, or the best it reaches on the planner's day. */
function displayRating(score: SpotScore | undefined, mode: Mode, day: number) {
  if (!score) return undefined;
  return mode === "now" ? score.now.rating : bestOnDay(score, day);
}

const UNKNOWN = { comfort: "unknown", safety: "unknown", food: "unknown" } as const;

export function App() {
  const appearance = useAppearance();
  const location = useLocation();
  const { route, go, back } = useRoute();
  const selected = route.name === "spot" ? route.id : undefined;
  const state = useSpots(location.point, selected);
  const detail = useSpotDetail(state, selected);
  const wide = useMedia("(min-width: 768px)");
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("now");
  const today = startOfDay(Date.now());
  const week = useMemo(() => nextDays(today, 7), [today]);
  const [day, setDay] = useState(today);
  // A page opened on a spot or About link starts with the sheet half open.
  const [detent, setDetent] = useState<Detent>(route.name === "list" ? "peek" : "half");

  const rows = useMemo(() => {
    return state.nearby
      .map((nearby) => ({ ...nearby, score: state.scores.get(nearby.spot.id) }))
      .sort((a, b) => {
        const rating =
          (b.score?.now.rating ?? -1) - (a.score?.now.rating ?? -1) ||
          (b.score?.windows[0]?.score ?? 0) - (a.score?.windows[0]?.score ?? 0);
        return rating || a.distanceKm - b.distanceKm;
      });
  }, [state.nearby, state.scores]);

  const mapSpots: MapSpot[] = rows.map(({ spot, score }) => ({
    id: spot.id,
    point: spot.coordinate,
    rating: displayRating(score, mode, day),
    name: spot.name,
  }));

  const open = (id: string) => {
    go({ name: "spot", id });
    if (!wide && detent === "peek") setDetent("half");
  };

  // Escape goes back, as on a desktop.
  useEffect(() => {
    if (route.name === "list") return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && back();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [route.name, back]);

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

  const listTitle = mode === "now" ? strings.list.nearTitle : strings.list.weekTitle;
  const near = selected ? state.nearby.find((n) => n.spot.id === selected) : undefined;
  const title =
    route.name === "spot"
      ? (near?.spot.name ?? strings.detail.spot)
      : route.name === "about"
        ? strings.about.title
        : listTitle;
  const page = `${routePath(route)}:${mode}`;
  const slide = reduced ? 0 : 24;

  return (
    <div className={styles.app} data-wide={wide || undefined}>
      <MapView
        centre={state.centre}
        spots={mapSpots}
        selected={selected}
        onSelect={open}
        scheme={appearance.scheme}
        padding={{ bottom: sheetPadding, left: wide ? 420 : 0 }}
        you={location.point}
      />

      <div className={styles.top}>
        <div className={styles.lead}>
          <button
            type="button"
            className={`glass ${styles.title}`}
            onClick={() => go({ name: "about" })}
            aria-label={strings.controls.about}
          >
            <span className="t-headline">{strings.appName}</span>
            {state.regionName && (
              <span className="t-subheadline secondary">{state.regionName}</span>
            )}
            <Info aria-hidden className={styles.info} />
          </button>
          <ChipGroup label={strings.modes.label} chips={MODES} value={mode} onChange={setMode} />
        </div>
        <GlassGroup vertical>
          <GlassButton
            bare
            label={
              location.status === "locating" ? strings.controls.locating : strings.controls.locate
            }
            pressed={location.status === "found"}
            onClick={location.locate}
          >
            <Crosshair weight={location.status === "found" ? "bold" : "regular"} aria-hidden />
          </GlassButton>
          <GlassButton
            bare
            label={strings.controls.appearance(appearance.preference)}
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
        title={title}
        back={route.name === "list" ? undefined : { label: listTitle, onClick: back }}
        accessory={
          route.name === "list" && state.scoring ? (
            <span className="t-footnote secondary">{strings.list.updating}</span>
          ) : undefined
        }
        page={page}
        detent={detent}
        onDetentChange={setDetent}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ opacity: 0, x: route.name === "list" ? -slide : slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={
              reduced ? { duration: 0.15 } : { ...spring.snappy, opacity: { duration: 0.15 } }
            }
          >
            {route.name === "spot" ? (
              near ? (
                <SpotDetail
                  spot={near.spot}
                  distanceKm={near.distanceKm}
                  summary={state.scores.get(near.spot.id)}
                  detail={detail.data}
                  config={state.config}
                  manifest={state.manifest}
                />
              ) : (
                <p className="t-callout secondary">
                  {state.status === "ready" ? strings.detail.notFound : strings.list.loading}
                </p>
              )
            ) : route.name === "about" ? (
              <About manifest={state.manifest} />
            ) : (
              <>
                <InstallHint />
                {location.status === "denied" && (
                  <p className="t-footnote secondary">
                    {strings.list.locationOff(state.regionName ?? "the region")}
                  </p>
                )}
                {state.status === "error" && (
                  <p className="t-callout" role="alert">
                    {strings.list.loadError(state.error)}
                  </p>
                )}
                {state.status === "loading" && (
                  <p className="t-callout secondary">{strings.list.loading}</p>
                )}
                {state.incomplete > 0 && (
                  <p className={`t-footnote secondary ${styles.note}`}>
                    {strings.list.weatherMissing(state.incomplete)}{" "}
                    <button type="button" className={styles.link} onClick={state.retryConditions}>
                      {strings.list.retry}
                    </button>
                  </p>
                )}
                {mode === "week" ? (
                  <WeekPlanner
                    days={week}
                    day={day}
                    onDay={setDay}
                    scores={state.scores}
                    nearby={state.nearby}
                    onSelect={open}
                  />
                ) : (
                  <div className={styles.list}>
                    {rows.map(({ spot, score, distanceKm }) => (
                      <SpotRow
                        key={spot.id}
                        id={spot.id}
                        name={spot.name}
                        detail={[
                          spot.locality,
                          strings.water[spot.waterType],
                          formatDistance(distanceKm),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        rating={score?.now.rating}
                        statuses={score?.now.statuses ?? UNKNOWN}
                        best={
                          score?.windows[0]
                            ? strings.list.best(
                                formatWindow(score.windows[0].start, score.windows[0].end),
                              )
                            : undefined
                        }
                        onSelect={() => open(spot.id)}
                      />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className={`t-subheadline ${styles.aboutRow}`}
                  onClick={() => go({ name: "about" })}
                >
                  <Info aria-hidden />
                  {strings.list.aboutRow}
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </Sheet>
    </div>
  );
}
