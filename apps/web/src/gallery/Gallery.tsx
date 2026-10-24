import { CircleHalf, Crosshair, Moon, Sun } from "@phosphor-icons/react";
import { useState } from "react";
import { ChipGroup } from "../components/ChipGroup.tsx";
import { GlassButton, GlassGroup } from "../components/GlassButton.tsx";
import { InstallHint } from "../components/Notice.tsx";
import { PillarMarks, RatingBadge } from "../components/Rating.tsx";
import { strings } from "../copy/strings.ts";
import { SpotRow } from "../components/SpotRow.tsx";
import { useAppearance } from "../data/appearance.ts";
import styles from "./Gallery.module.css";

const ROLES = ["accent", "comfort", "safety", "food", "rating-3x", "rating-2x"] as const;
const TYPE = [
  "large-title", "title1", "title2", "title3", "headline", "body",
  "callout", "subheadline", "footnote", "caption1", "caption2",
] as const; // prettier-ignore

/** Every component in every state, for reviewing the look on a real phone (/gallery). */
export function Gallery() {
  const appearance = useAppearance();
  const [chip, setChip] = useState<"now" | "week" | "month">("now");
  const ThemeIcon =
    appearance.preference === "system"
      ? CircleHalf
      : appearance.preference === "light"
        ? Sun
        : Moon;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className="t-large-title">Gallery</h1>
        <GlassButton label={`Appearance: ${appearance.preference}`} onClick={appearance.cycle}>
          <ThemeIcon aria-hidden />
        </GlassButton>
      </header>

      <section>
        <h2 className="t-title3">Colour roles</h2>
        <div className={styles.swatches}>
          {ROLES.map((role) => (
            <div key={role} className={styles.swatch}>
              <span
                className={styles.fill}
                style={{ background: `var(--${role}-fill)`, color: "var(--on-fill)" }}
              >
                Aa
              </span>
              <span className="t-footnote" style={{ color: `var(--${role}-ink)` }}>
                {role} ink
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="t-title3">Type</h2>
        {TYPE.map((style) => (
          <p key={style} className={`t-${style} ${styles.type}`}>
            {style} · Fort Kochi Breakwater 06:30
          </p>
        ))}
      </section>

      <section>
        <h2 className="t-title3">Controls on glass</h2>
        <div className={styles.backdrop}>
          <ChipGroup
            label="Range"
            chips={[
              { id: "now", label: "Now" },
              { id: "week", label: "This week" },
              { id: "month", label: "45 days" },
            ]}
            value={chip}
            onChange={setChip}
          />
          <GlassGroup vertical>
            <GlassButton bare label="Locate">
              <Crosshair aria-hidden />
            </GlassButton>
            <GlassButton bare label="Appearance">
              <CircleHalf aria-hidden />
            </GlassButton>
          </GlassGroup>
        </div>
      </section>

      <section>
        <h2 className="t-title3">Ratings</h2>
        <div className={styles.row}>
          {[3, 2, 1, 0].map((r) => (
            <span key={r} className={styles.rating}>
              <RatingBadge rating={r} size="l" />
              <span className="t-caption1 secondary">{strings.rating.label(r)}</span>
            </span>
          ))}
        </div>
        <div className={styles.row}>
          <PillarMarks statuses={{ comfort: "earned", safety: "earned", food: "earned" }} />
          <PillarMarks statuses={{ comfort: "earned", safety: "missed", food: "earned" }} />
          <PillarMarks statuses={{ comfort: "unknown", safety: "earned", food: "missed" }} />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className="t-title3">List rows</h2>
        <InstallHint force />
        <SpotRow
          name="Fort Kochi Breakwater"
          detail="Fort Kochi · Coastal · 1.2 km"
          rating={3}
          statuses={{ comfort: "earned", safety: "earned", food: "earned" }}
          best="Best Today 17:30–20:15"
        />
        <SpotRow
          name="Vypin Mangrove Edge"
          detail="Vypin · Estuary · 2.4 km"
          rating={2}
          statuses={{ comfort: "earned", safety: "missed", food: "earned" }}
          best="Best Tue 06:30–08:30"
          selected
        />
        <SpotRow
          name="Periyar at Aluva Manalpuram"
          detail="Aluva · Freshwater · 18 km"
          rating={1}
          statuses={{ comfort: "unknown", safety: "earned", food: "missed" }}
        />
      </section>
    </main>
  );
}
