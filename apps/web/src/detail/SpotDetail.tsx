import { Export, NavigationArrow } from "@phosphor-icons/react";
import type { Band, Manifest, Pillar, Reason, ScoringConfig, Spot } from "@threex/core";
import { PILLARS } from "@threex/core";
import { type ReactNode, useState } from "react";
import { cx } from "../components/cx.ts";
import { PillarIcon, RatingBadge } from "../components/Rating.tsx";
import { formatDistance, formatMoment, formatNumber, formatWindow } from "../copy/format.ts";
import { pillarSummary } from "../copy/reasons.ts";
import { strings } from "../copy/strings.ts";
import type { SpotDetail as Detail, SpotScore, WindowLite } from "../workers/protocol.ts";
import { DayChart } from "./DayChart.tsx";
import { directionsUrl, isApple } from "./model.ts";
import styles from "./SpotDetail.module.css";
import { WeekGrid } from "./WeekGrid.tsx";

interface Props {
  spot: Spot;
  distanceKm?: number;
  summary?: SpotScore;
  detail?: Detail | null;
  config?: ScoringConfig;
  manifest?: Manifest;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className="t-headline">{title}</h3>
      {children}
    </section>
  );
}

const windowDetail = (w: WindowLite) =>
  strings.planner.windowDetail(w.tidePhase && strings.tide[w.tidePhase], strings.light[w.light]);

/** "Recommended now, until 08:15" or "Worth a look now · Next 3X: Today 17:30–19:15". */
function Hero({ rating, detail }: { rating?: number; detail?: Detail | null }) {
  const flip = rating === 2 ? detail?.flips[0] : undefined;
  return (
    <div className={styles.hero}>
      <RatingBadge rating={rating} size="l" />
      <div className={styles.heroText}>
        <p className="t-title3">
          {rating === undefined
            ? strings.detail.scoring
            : strings.detail.now(strings.rating.label(rating))}
        </p>
        {detail && (
          <p className="t-subheadline secondary">
            {detail.holdsUntil
              ? strings.detail.until(formatMoment(detail.holdsUntil, detail.start))
              : strings.detail.allWeek}
          </p>
        )}
        {detail && rating !== undefined && rating < 3 && (
          <p className="t-subheadline">
            {detail.nextWindow
              ? strings.detail.next3x(formatWindow(detail.nextWindow.start, detail.nextWindow.end))
              : strings.detail.no3x}
          </p>
        )}
        {flip && (
          <p className={cx("t-subheadline", styles.flip)}>
            {strings.detail.flip(
              strings.pillar[flip.missing],
              flip.window.tidePhase && strings.tide[flip.window.tidePhase],
              formatWindow(flip.window.start, flip.window.end),
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function Pillars({
  detail,
  band,
}: {
  detail: Detail;
  band: (pillar: Pillar) => (reason: Reason) => Band | undefined;
}) {
  return (
    <ul className={styles.pillars}>
      {PILLARS.map((p) => {
        const result = detail.now.pillars[p];
        return (
          <li key={p} className={styles.pillar}>
            <PillarIcon pillar={p} status={result.status} large />
            <div>
              <p className="t-headline">
                {strings.pillar[p]}
                <span className={cx("t-subheadline", styles.status, styles[result.status])}>
                  {strings.pillarStatus[result.status]}
                </span>
              </p>
              {pillarSummary(result, band(p)).map((line) => (
                <p key={line} className="t-subheadline secondary">
                  {line}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Conditions({ detail, coastal }: { detail: Detail; coastal: boolean }) {
  const c = detail.conditions;
  const kmh = (ms: number) => `${formatNumber(ms * 3.6)} km/h`;
  const tiles: [string, string, string?][] = [];
  if (c.windMs !== undefined) tiles.push([strings.conditions.wind, kmh(c.windMs)]);
  if (c.cloud !== undefined)
    tiles.push([strings.conditions.cloud, `${formatNumber(c.cloud * 100)} %`]);
  if (c.airC !== undefined) tiles.push([strings.conditions.air, `${formatNumber(c.airC)} °C`]);
  if (c.seaC !== undefined)
    tiles.push([
      strings.conditions.water,
      `${formatNumber(c.seaC, 1)} °C`,
      c.seaNormalC !== undefined ? strings.conditions.vsNormal(c.seaC - c.seaNormalC) : undefined,
    ]);
  // Open-Meteo answers inland points from the nearest sea cell, so waves are shown only
  // where the spot is on the open coast.
  if (c.waveM !== undefined && coastal)
    tiles.push([strings.conditions.waves, `${formatNumber(c.waveM, 1)} m`]);
  if (c.currentMs !== undefined) tiles.push([strings.conditions.current, kmh(c.currentMs)]);
  if (c.dischargeCumecs !== undefined)
    tiles.push([
      strings.conditions.river,
      `${formatNumber(c.dischargeCumecs)} m³/s`,
      c.medianCumecs ? strings.conditions.vsMedian(c.dischargeCumecs / c.medianCumecs) : undefined,
    ]);
  if (!tiles.length) return <p className="t-subheadline secondary">{strings.conditions.none}</p>;
  return (
    <dl className={styles.conditions}>
      {tiles.map(([label, value, note]) => (
        <div key={label} className={styles.tile}>
          <dt className="t-footnote secondary">{label}</dt>
          <dd className="t-title3 tabular">{value}</dd>
          {note && <dd className="t-footnote secondary">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Facts({ spot, manifest }: { spot: Spot; manifest?: Manifest }) {
  const habitat = (
    Object.entries(strings.facts.habitat) as [keyof typeof strings.facts.habitat, string][]
  )
    .map(([key, label]) => [label, spot.habitat[key]] as const)
    .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number")
    .filter(([, m]) => m <= 5_000);
  const credits = (manifest?.attributions ?? []).filter((a) => spot.sources.includes(a.id));
  return (
    <>
      <ul className={cx("t-subheadline", styles.facts)}>
        {spot.features.map((f) => (
          <li key={`${f.kind}-${f.distanceM}`}>{strings.facts.feature(f.kind, f.distanceM)}</li>
        ))}
        {habitat.map(([label, m]) => (
          <li key={label}>
            {label}, {formatDistance(m / 1000)}
          </li>
        ))}
        <li>{spot.depthM != null ? strings.facts.depth(spot.depthM) : strings.facts.noDepth}</li>
        <li>
          {strings.facts.confidence(spot.confidence)}
          <span className="secondary"> · {strings.facts.confidenceHint}</span>
        </li>
        <li className="tabular">
          {strings.facts.coordinates}: {spot.coordinate.lat.toFixed(5)},{" "}
          {spot.coordinate.lon.toFixed(5)}
        </li>
      </ul>
      {credits.length > 0 && (
        <ul className={cx("t-footnote secondary", styles.credits)}>
          {credits.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function share(spot: Spot): Promise<boolean> {
  const url = `${location.origin}/spot/${spot.id}`;
  if (navigator.share) {
    await navigator.share({ title: spot.name, url }).catch(() => undefined);
    return false;
  }
  await navigator.clipboard?.writeText(url);
  return true;
}

export function SpotDetail({ spot, distanceKm, summary, detail, config, manifest }: Props) {
  const [copied, setCopied] = useState(false);
  const rating = detail?.now.rating ?? summary?.now.rating;
  const scoring = config?.waterTypes[spot.waterType];
  const band = (pillar: Pillar) => (reason: Reason) => scoring?.[pillar].signals[reason.signal];
  return (
    <article className={styles.detail}>
      <p className="t-subheadline secondary">
        {[
          spot.locality,
          strings.water[spot.waterType],
          distanceKm !== undefined && formatDistance(distanceKm),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className={styles.actions}>
        <a
          className={cx("t-headline", styles.primary)}
          href={directionsUrl(
            spot.coordinate,
            spot.name,
            isApple(navigator.userAgent, navigator.platform),
          )}
          target="_blank"
          rel="noreferrer"
        >
          <NavigationArrow aria-hidden weight="fill" />
          {strings.detail.directions}
        </a>
        <button
          type="button"
          className={cx("t-headline", styles.secondary)}
          onClick={() =>
            void share(spot).then((didCopy) => {
              setCopied(didCopy);
              if (didCopy) setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          <Export aria-hidden weight="bold" />
          {copied ? strings.detail.shared : strings.detail.share}
        </button>
      </div>

      <Hero rating={rating} detail={detail} />

      {detail ? (
        <>
          <Section title={strings.detail.whyTitle}>
            <Pillars detail={detail} band={band} />
          </Section>

          <Section title={strings.detail.todayTitle}>
            {detail.now.tide && (
              <p className="t-subheadline secondary">
                {strings.detail.tideNow(
                  detail.now.tide.heightCm,
                  strings.tide[detail.now.tide.phase],
                )}
              </p>
            )}
            <DayChart detail={detail} />
          </Section>

          <Section title={strings.detail.weekTitle}>
            <WeekGrid detail={detail} />
          </Section>

          {detail.windows.length > 0 && (
            <Section title={strings.detail.windowsTitle}>
              <ol className={styles.windows}>
                {detail.windows.map((w) => (
                  <li key={w.start}>
                    <span className="t-headline tabular">{formatWindow(w.start, w.end)}</span>
                    <span className="t-subheadline secondary">{windowDetail(w)}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title={strings.detail.conditionsTitle}>
            <Conditions detail={detail} coastal={spot.waterType === "coastal"} />
          </Section>
        </>
      ) : (
        detail === null && <p className="t-callout secondary">{strings.detail.notFound}</p>
      )}

      <Section title={strings.detail.spotTitle}>
        <Facts spot={spot} manifest={manifest} />
      </Section>

      <p className={cx("t-footnote secondary", styles.disclaimer)}>{strings.detail.disclaimer}</p>
    </article>
  );
}
