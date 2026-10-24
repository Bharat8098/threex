// Screenshots of every screen at iPhone and iPad sizes in light, dark, Increase Contrast,
// Reduce Motion and the largest standard text size, plus the app offline. Needs a running
// dev server (npm run dev) and network for map tiles and weather.
//   node apps/web/scripts/screenshots.mjs [baseUrl]      ONLY=detail-iphone,about limits it
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(out, { recursive: true });

// Weather is recorded on first use and replayed for 6 hours: every page sees the same
// conditions, and a full run makes a few dozen Open-Meteo requests instead of hundreds.
const weather = `${out}.weather/`;
mkdirSync(weather, { recursive: true });
const recorded = (url) => weather + createHash("sha1").update(url).digest("hex");
function replayWeather(route) {
  const file = recorded(route.request().url());
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < 6 * 3_600_000) {
    return route.fulfill({
      body: readFileSync(file),
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
    });
  }
  return route.continue();
}
async function recordWeather(response) {
  if (/open-meteo\.com/.test(response.url()) && response.ok()) {
    writeFileSync(recorded(response.url()), await response.body().catch(() => ""));
  }
}

const devices = {
  iphone: {
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  ipad: {
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
};
const modes = {
  light: { colorScheme: "light" },
  dark: { colorScheme: "dark" },
  contrast: { colorScheme: "light", contrast: "more" },
  "reduced-motion": { colorScheme: "light", reducedMotion: "reduce" },
  "large-text": { colorScheme: "light" },
  offline: { colorScheme: "light" },
};
// iOS's largest non-accessibility Text Size sets body text to 23 pt (Safari applies it through
// `font: -apple-system-body`); Chromium can't, so the root size is raised to match.
const LARGE_TEXT = "html { font-size: calc(23 / 16 * 100%) !important; }";
const SPOT_ROW = "[data-spot]";

async function scored(tab, name) {
  await tab
    .waitForSelector(SPOT_ROW, { timeout: 60_000 })
    .catch(() => console.log(`[${name}] no spots rendered`));
  // Rows appear before scoring starts, so wait until no rating is pending and nothing is
  // updating.
  await tab
    .waitForFunction(
      () =>
        !document.querySelector('[aria-label="Rating not ready yet"]') &&
        !document.body.innerText.includes("Updating…"),
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => console.log(`[${name}] still scoring`));
}

/** On phones, drag-free: the grabber steps the sheet up to full height. */
async function expandSheet(tab) {
  for (let i = 0; i < 2; i++) {
    const grabber = tab.getByRole("button", { name: "Expand list" });
    if (!(await grabber.count())) return;
    await grabber.click();
    await tab.waitForTimeout(500);
  }
}

// Each page: where to start and how to get to the screen.
const pages = {
  app: { path: "/", go: scored },
  detail: {
    path: "/",
    go: async (tab, name) => {
      await scored(tab, name);
      await tab.locator(SPOT_ROW).first().click();
      await tab
        .getByRole("heading", { name: "Why" })
        .waitFor({ timeout: 60_000 })
        .catch(() => console.log(`[${name}] detail not scored`));
      await expandSheet(tab);
    },
  },
  planner: {
    path: "/",
    go: async (tab, name) => {
      await scored(tab, name);
      await tab.getByRole("radio", { name: "This week" }).click();
      await expandSheet(tab);
    },
  },
  about: { path: "/about", go: expandSheet },
  gallery: { path: "/gallery", go: () => {} },
};
const only = process.env.ONLY?.split(",");

const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" }
  : undefined;
const browser = await chromium.launch({
  proxy,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
for (const [device, deviceOptions] of Object.entries(devices)) {
  for (const [mode, modeOptions] of Object.entries(modes)) {
    for (const [page, { path, go }] of Object.entries(pages)) {
      const name = `${page}-${device}-${mode}`;
      if (only && !only.some((o) => name.includes(o))) continue;
      if (mode === "offline" && page !== "app") continue;
      const context = await browser.newContext({
        ...deviceOptions,
        ...modeOptions,
        serviceWorkers: "block",
        timezoneId: "Asia/Kolkata",
        locale: "en-IN",
      });
      await context.route(/open-meteo\.com/, replayWeather);
      context.on("response", (response) => void recordWeather(response));
      const tab = await context.newPage();
      tab.on("pageerror", (e) => console.log(`[${name}] page error: ${e.message}`));
      if (mode === "large-text") {
        // Before the app starts, as on a device, so measured layouts (the sheet) see it.
        await tab.addInitScript((css) => {
          // "interactive" comes before deferred module scripts run.
          document.addEventListener("readystatechange", () => {
            if (document.readyState !== "interactive") return;
            const style = document.createElement("style");
            style.textContent = css;
            document.head.append(style);
          });
        }, LARGE_TEXT);
      }
      await tab.goto(base + path);
      await go(tab, name);
      if (mode === "offline") await context.setOffline(true);
      // Let the map and any transition settle.
      await tab.waitForTimeout(page === "gallery" ? 800 : 2500);
      const overflow = await tab.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) console.log(`[${name}] scrolls sideways by ${overflow}px`);
      await tab.screenshot({ path: `${out}${name}.png`, fullPage: page === "gallery" });
      console.log(`wrote ${name}.png`);
      await context.close();
    }
  }
}
await browser.close();
