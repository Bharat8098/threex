# Design system

ThreeX is a web app that should feel like a premium iOS app. It follows Apple's Human Interface Guidelines in spirit: system typography, system colours, a glass control layer, and spring motion. It is **outdoor-first**: light mode is designed and tested before dark mode, because anglers use it in direct sun.

All tokens live in `apps/web/src/design/` (`tokens.css`, `glass.css`, `motion.ts`). Components never hard-code colours, font sizes, radii or easing. The gallery at **`/gallery`** shows every token and component in the current appearance.

---

## Colour

Values are Apple's published iOS system colours (HIG, iOS 26) as CSS custom properties. Each token has four values (light, dark, and the Increased Contrast light and dark variants), chosen with `light-dark()` and `@media (prefers-contrast: more)`.

### Roles

Each role comes as a `-fill` and an `-ink` token (see *The outdoor contrast rule* below).

| Tokens | System colour | Role |
|---|---|---|
| `--accent-fill`, `--accent-ink` | Teal | tint for primary actions, selection, links |
| `--comfort-fill`, `--comfort-ink` | Cyan | Comfort mark, chart series |
| `--safety-fill`, `--safety-ink` | Indigo | Safety mark, chart series |
| `--food-fill`, `--food-ink` | Orange | Food mark, chart series |
| `--rating-3x-fill`, `--rating-3x-ink` | Green | Recommended badge and map pin |
| `--rating-2x-fill`, `--rating-2x-ink` | Yellow | Worth-a-look badge and map pin |
| `--rating-low-fill`, `--rating-low-ink` | Gray | 0–1X, muted |

### Values (R, G, B)

| Colour | Light | Dark | IC light | IC dark |
|---|---|---|---|---|
| Teal | 0, 195, 208 | 0, 210, 224 | 0, 129, 152 | 59, 221, 236 |
| Cyan | 0, 192, 232 | 60, 211, 254 | 0, 126, 174 | 109, 217, 255 |
| Indigo | 97, 85, 245 | 109, 124, 255 | 86, 74, 222 | 167, 170, 255 |
| Orange | 255, 141, 40 | 255, 146, 48 | 197, 83, 0 | 255, 160, 86 |
| Green | 52, 199, 89 | 48, 209, 88 | 0, 137, 50 | 74, 217, 104 |
| Yellow | 255, 204, 0 | 255, 214, 0 | 161, 106, 0 | 254, 223, 67 |
| Red (warnings) | 255, 56, 60 | 255, 66, 69 | 233, 21, 45 | 255, 97, 101 |

Neutrals use the iOS semantic colours: label `#000` / `#FFF`; secondary label `rgba(60,60,67,.6)` / `rgba(235,235,245,.6)`; system background `#FFF` / `#000`; secondary background `#F2F2F7` / `#1C1C1E`; separator `rgba(60,60,67,.29)` / `rgba(84,84,88,.6)`.

### The outdoor contrast rule

Measured against a white background, the default light-mode tints are too faint to read in sunlight:

| On white | Teal | Cyan | Orange | Green | Yellow | Indigo |
|---|---|---|---|---|---|---|
| Default light | 2.2:1 ❌ | 2.2:1 ❌ | 2.3:1 ❌ | 2.2:1 ❌ | 1.5:1 ❌ | 5.1:1 ✅ |
| Increased-contrast light | 4.6:1 ✅ | 4.6:1 ✅ | 4.6:1 ✅ | 4.5:1 ✅ | 4.6:1 ✅ | 6.1:1 ✅ |
| Black text *on* the default tint | 9.7:1 ✅ | 9.7:1 ✅ | 9.1:1 ✅ | 9.5:1 ✅ | 13.9:1 ✅ | — |

So every role has two forms:

- **`-fill`**: the default tint, used as a **background**, with **label-coloured (black) text** on top. This is used for badges, pins and chips.
- **`-ink`**: the **Increased-Contrast tint in light mode** (the default tint in dark mode), used for **text, icons and thin strokes** on plain backgrounds.

**Never put white text on a light-mode tint fill** (about 2:1). Text on a fill uses `--on-fill`, which is black. Under Increase Contrast in light mode, the fills switch to the IC values, which are dark enough for white text, so `--on-fill` turns white there. Colour is never the only signal: every rating also shows its X count and a text label.

---

## Typography

- **Font stack:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`. This renders SF Pro on Apple devices.
- **Rounded numerals:** `ui-rounded` (SF Pro Rounded in Safari) for the "3X" badge and big numbers.
- **Respecting the user's text size:** the root uses `font: -apple-system-body` (with a 17 px fallback), so iOS's Text Size setting scales the whole app. Every token is in `rem`.
- **Times and heights:** `font-variant-numeric: tabular-nums`.

| Token | iOS style | Size / line height (pt at default size) | Weight |
|---|---|---|---|
| `--text-large-title` | Large Title | 34 / 41 | 700 |
| `--text-title1` | Title 1 | 28 / 34 | 700 |
| `--text-title2` | Title 2 | 22 / 28 | 700 |
| `--text-title3` | Title 3 | 20 / 25 | 600 |
| `--text-headline` | Headline | 17 / 22 | 600 |
| `--text-body` | Body | 17 / 22 | 400 |
| `--text-callout` | Callout | 16 / 21 | 400 |
| `--text-subheadline` | Subheadline | 15 / 20 | 400 |
| `--text-footnote` | Footnote | 13 / 18 | 400 |
| `--text-caption1` | Caption 1 | 12 / 16 | 400 |
| `--text-caption2` | Caption 2 | 11 / 13 | 400 |

## Icons

SF Symbols' licence does not allow use on the web. We use **Phosphor** (MIT), which has SF-like weights. Icons are regular weight in content and fill weight in selected and active states.

| Meaning | Phosphor icon |
|---|---|
| Comfort | `Waves` |
| Safety | `ShieldChevron` |
| Food | `Fish` |
| Tide | `ArrowsDownUp` (rising/falling variants) |
| Light | `SunHorizon`, `Moon` |
| Wind | `Wind` |
| Locate me | `Crosshair` (bold once located) |
| Appearance: system / light / dark | `CircleHalf`, `Sun`, `Moon` |
| Offline | `CloudSlash` |
| Share (in the install hint) | `Export` |

A pillar mark is **filled** in the pillar's ink colour when the X is earned, a tertiary outline when it is missed, and dashed when the pillar is unknown (no data).

---

## Glass

The web can't reproduce Liquid Glass's refraction on iOS. Safari doesn't support SVG displacement in `backdrop-filter`. We build a premium **frosted glass** that follows the same rules.

**Recipe (`glass.css`):**
- translucent tinted fill: `color-mix()` of the background at about 72% in light mode and 60% in dark mode;
- `backdrop-filter: blur(24px) saturate(180%)`, with the `-webkit-` prefix;
- a 0.5 px light border, an inner top highlight, and a soft long shadow.

**Rules (from the HIG):**
- **Glass is for the control layer only.** That means floating map controls, the search field, filter chips, toolbars and the sheet header. Content such as lists, cards and detail stays on solid backgrounds.
- **Never stack glass on glass.** Group related controls in one glass container.
- **Use colour on glass sparingly.** Reserve it for the primary action or a status badge, and tint the background rather than the label.
- **Sunlight legibility:** light mode uses the more opaque fill, and the "clear" glass variant is never used over the map.
- **Accessibility:** under `prefers-contrast: more` and `prefers-reduced-transparency` (where the browser supports it), glass becomes a solid surface with a stronger border.
- Chromium-only SVG refraction is optional progressive enhancement, and always off on iOS.

---

## Motion

Motion uses the `motion` library with named springs that mirror SwiftUI. Only `transform` and `opacity` are animated.

| Preset | Spring | Use |
|---|---|---|
| `smooth` | stiffness 260, damping 30 | default: sheets, navigation, layout |
| `snappy` | stiffness 420, damping 34 | controls, chips, toggles |
| `bouncy` | stiffness 320, damping 18 | the 3X reveal only, used sparingly |

**Patterns:**
- **Card → detail:** shared-element transition (`layoutId`).
- **Filter chips:** they morph inside one glass container, mimicking `glassEffectID`.
- **Bottom sheet:** drag with velocity-aware snap points (peek / half / full).
- **Numbers:** they roll when values change.
- **Tide chart:** draws in on first appearance.

**Reduced motion:** under `prefers-reduced-motion`, every transition becomes a short crossfade, and nothing moves on its own.

## Layout

- **iPhone:** a full-bleed map with floating glass controls and a draggable bottom sheet. The sheet's peek detent is set in `rem`, so it grows with the text size.
- **iPad and desktop (≥ 768 px wide):** a fixed panel beside the map, holding the same pages as the sheet.
- **Text:** names and times wrap rather than truncate; a number and its unit never split ("3.9 km" uses a non-breaking space).
- Uses `viewport-fit=cover` with `env(safe-area-inset-*)`.
- Minimum tap target is 44 × 44 px.
- Corner radii follow concentric shapes: inner radius = outer radius − padding.

## Screens

Everything happens in the sheet (or the iPad panel), like Apple Maps. The map never goes away, and it follows what the sheet shows.

Lists are **exhaustive**: every spot within reach is listed and every qualifying spot is shown, never a top-N. Long lists stay quick: rows are memoised, press feedback is a CSS transition (`.pressable`), and ratings fill in nearest first as the worker scores them in batches.

| Page | URL | What it shows |
|---|---|---|
| **Near you** (Now) | `/` | every spot within 25 km, sorted by rating now, then nearest first |
| **Best this week** (This week) | `/` | a strip of 7 days; for the chosen day, every spot that reaches 3X, each at its best window, best first |
| **Spot detail** | `/spot/<id>` | below |
| **About & Data** | `/about` | the 3X idea, how ratings work, every data credit, privacy, *Clear saved data*, open source, safety |

A page pushes with a short slide (a crossfade under Reduce Motion), and a back link labelled with where it goes ("‹ Near you") returns. Each page has its own URL, so the browser's back button works and a spot can be shared. Escape goes back on a keyboard. About opens from the title pill (ThreeX ⓘ) and from the foot of the list.

**Spot detail**, top to bottom:
1. Locality · water type · distance, then **Directions** (opens Apple Maps on Apple devices, Google Maps elsewhere, with the spot's coordinates; the maps app uses the device's own location) and **Share** (the share sheet, or copy the link).
2. **Hero:** the big badge, "Recommended now", and until when it holds. When not 3X, the next 3X window. When 2X, the flip: "Gets Safety on the rising tide, Today 20:00–21:15".
3. **Why:** the three pillars, each with its status and the one or two reasons that matter most (what helped if earned, what held it back if not), in plain words: "Breakwater 15 m away", "Mangroves still dry", "Overcast: low light".
4. **Today:** the next 24 hours: tide curve with highs and lows, night shaded, and the rating ribbon under it (green 3X, yellow 2X). Freshwater spots show only the ribbon.
5. **This week:** seven ribbons, midnight to midnight, with a legend.
6. **Best windows:** the top five, with tide and light.
7. **Conditions now:** wind, cloud, air and water temperature (against the usual for the month), waves (coastal spots only: Open-Meteo answers inland points from the nearest sea cell), current, river flow (against its median).
8. **About this spot:** nearby structure and habitat with distances, depth, confidence, coordinates, and the data credits for this spot.
9. The safety note.

## Words

All user-facing text is in `apps/web/src/copy/`: `strings.ts` (every label and sentence), `reasons.ts` (reason codes into phrases) and `format.ts` (times, numbers and distances). A translation is a new strings file, checked by a native speaker. Units are metric: km/h for wind and current, °C, metres, m³/s. Write short, plain sentences: the app is read outdoors, at a glance.

## Map

- **Basemap:** OpenFreeMap's Positron (light) and Dark styles, switched with the appearance. Administrative boundary layers are removed: they add nothing at fishing zoom levels, and India requires official boundaries on any map that shows them.
- **Pins:** MapLibre needs concrete colours, so `color()` in `motion.ts` resolves the rating tokens at runtime. Better ratings draw on top. Pins still being scored are faded, and the "3X" labels appear from zoom 13.
- **Credits:** the compact attribution (i) control stays visible at the top right, under the glass controls. Nothing may cover it, including the offline banner.

## Appearance

The app follows the system appearance unless the user picks light or dark with the appearance button. That choice is the only preference stored (`localStorage`, key `threex-appearance`).

## Verification for every UI change

`npm run screenshots -w @threex/web` (with `npm run dev -w @threex/web` running) writes Playwright screenshots of the app and `/gallery` to `apps/web/screenshots/`. It covers iPhone (393 × 852) and iPad (820 × 1180) in each of these modes:
- light
- dark
- Increase Contrast (`prefers-contrast: more`)
- Reduce Motion (`prefers-reduced-motion`)
- the largest standard text size (body at 23 pt)
- offline (app only)

`ONLY=app-iphone-light,ipad-dark` limits the run. The script waits for scoring to finish and warns about pages that scroll sideways. Look at every image, then check the PR preview URL on a real iPhone, outdoors when possible.
