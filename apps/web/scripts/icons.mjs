// Renders public/icons/icon.svg to the PNG sizes browsers and iOS want. Run after editing it:
//   node apps/web/scripts/icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const rounded = readFileSync(here("../public/icons/icon.svg"), "utf8");
const square = readFileSync(here("./icon-square.svg"), "utf8");
// Maskable icons keep the glyph inside the central 80% safe zone.
const maskable = square
  .replace("<g ", '<g transform="translate(51 51) scale(0.8)" ')
  .replace('<path d="M84 392', '<path transform="translate(51 51) scale(0.8)" d="M84 392');

const outputs = [
  ["icon-192.png", 192, rounded],
  ["icon-512.png", 512, rounded],
  ["icon-maskable-512.png", 512, maskable],
  ["apple-touch-icon.png", 180, square], // iOS rounds the corners itself
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, svg] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await page.screenshot({ path: here(`../public/icons/${name}`), omitBackground: true });
  console.log(`wrote ${name}`);
}
await browser.close();
