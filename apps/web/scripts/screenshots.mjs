// Screenshots of every page at iPhone and iPad sizes in light, dark, Increase Contrast and
// Reduce Motion and the largest standard text size, plus the app offline. Needs a running dev server (npm run dev) and network for map tiles/weather.
//   node apps/web/scripts/screenshots.mjs [baseUrl]
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:5173";
const out = fileURLToPath(new URL("../screenshots/", import.meta.url));
mkdirSync(out, { recursive: true });

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
const pages = { app: "/", gallery: "/gallery" };
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
    for (const [page, path] of Object.entries(pages)) {
      const name = `${page}-${device}-${mode}`;
      if (only && !only.some((o) => name.includes(o))) continue;
      if (mode === "offline" && page !== "app") continue;
      const context = await browser.newContext({
        ...deviceOptions,
        ...modeOptions,
        serviceWorkers: "block",
      });
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
      if (page === "app") {
        await tab
          .waitForSelector('[id^="spot-"]', { timeout: 60_000 })
          .catch(() => console.log(`[${name}] no spots rendered`));
        // Wait for scoring to finish, then for the map to settle.
        await tab
          .getByText("Updating…")
          .waitFor({ state: "hidden", timeout: 90_000 })
          .catch(() => console.log(`[${name}] still scoring`));
        if (mode === "offline") await context.setOffline(true);
        await tab.waitForTimeout(2500);
      } else {
        await tab.waitForTimeout(800);
      }
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
