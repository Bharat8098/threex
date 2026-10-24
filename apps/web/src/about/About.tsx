import { useQueryClient } from "@tanstack/react-query";
import type { Manifest } from "@threex/core";
import { PILLARS } from "@threex/core";
import { type ReactNode, useState } from "react";
import { PillarIcon, RatingBadge } from "../components/Rating.tsx";
import { cx } from "../components/cx.ts";
import { strings } from "../copy/strings.ts";
import { APPEARANCE_KEY } from "../data/appearance.ts";
import styles from "./About.module.css";

const REPO = "https://github.com/Bharat8098/threex";

/** Credits for what the app itself fetches (the catalogue's own credits come from its
 * manifest). */
const APP_CREDITS = [
  {
    id: "open-meteo",
    text: "Weather, waves and river flow: Open-Meteo.com (CC BY 4.0)",
    url: "https://open-meteo.com/",
  },
  {
    id: "openfreemap",
    text: "Map: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors",
    url: "https://openfreemap.org/",
  },
];

const builtDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className="t-headline">{title}</h3>
      {children}
    </section>
  );
}

/** Deletes everything ThreeX stores on this device: cached spots, forecasts and map tiles,
 * and the appearance choice. The app downloads what it needs again. */
async function clearSavedData() {
  if ("caches" in self) {
    for (const key of await caches.keys()) await caches.delete(key);
  }
  try {
    localStorage.removeItem(APPEARANCE_KEY);
    sessionStorage.clear();
  } catch {
    // Storage may be unavailable (private mode); nothing to clear then.
  }
}

export function About({ manifest }: { manifest?: Manifest }) {
  const queryClient = useQueryClient();
  const [cleared, setCleared] = useState(false);
  const credits = [
    ...(manifest?.attributions ?? []).sort(
      (a, b) => Number(b.displayRequired) - Number(a.displayRequired),
    ),
    ...APP_CREDITS,
  ];
  return (
    <article className={styles.about}>
      <p className="t-body">{strings.about.intro}</p>

      <ul className={styles.pillars}>
        {PILLARS.map((p) => (
          <li key={p}>
            <PillarIcon pillar={p} status="earned" large />
            <p>
              <strong className="t-headline">{strings.pillar[p]}</strong>
              <span className="t-subheadline secondary"> {strings.about.pillars[p]}</span>
            </p>
          </li>
        ))}
      </ul>

      <Section title={strings.about.ratingsTitle}>
        <ul className={styles.ratings}>
          {strings.about.ratings.map((text, i) => (
            <li key={text}>
              <RatingBadge rating={3 - i} size="s" />
              <span className="t-subheadline">{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={strings.about.howTitle}>
        <ul className={cx("t-subheadline", styles.bullets)}>
          {strings.about.how.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Section>

      <Section title={strings.about.creditsTitle}>
        <ul className={cx("t-subheadline", styles.credits)}>
          {credits.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.text}
              </a>
            </li>
          ))}
        </ul>
        {manifest && (
          <p className="t-footnote secondary tabular">
            {strings.about.dataVersion(
              manifest.region.name,
              builtDate.format(Date.parse(manifest.generatedAt)),
            )}
            <br />
            {strings.about.scoringVersion(manifest.scoring.version)}
          </p>
        )}
      </Section>

      <Section title={strings.about.privacyTitle}>
        <ul className={cx("t-subheadline", styles.bullets)}>
          {strings.about.privacy.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <button
          type="button"
          className={cx("t-headline", styles.button)}
          disabled={cleared}
          onClick={() =>
            void clearSavedData().then(() => {
              queryClient.clear();
              setCleared(true);
            })
          }
        >
          {cleared ? strings.about.cleared : strings.about.clear}
        </button>
      </Section>

      <Section title={strings.about.sourceTitle}>
        <p className="t-subheadline">
          {strings.about.source}{" "}
          <a href={REPO} target="_blank" rel="noreferrer">
            {strings.about.sourceLink}
          </a>
        </p>
      </Section>

      <Section title={strings.about.disclaimerTitle}>
        <p className="t-subheadline secondary">{strings.detail.disclaimer}</p>
      </Section>
    </article>
  );
}
