// Headless playtest for the Babylon build. Drives the real game through the
// browser and reports what actually happened, rather than trusting a typecheck.
//
//   node scripts/playtest.mjs [url] [outDir]
//
// Keys must be HELD (~120ms) with gaps (~90ms) or the game's "just pressed"
// edge detection drops them.

import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const outDir = resolve(process.argv[3] ?? 'playtest-out');
mkdirSync(outDir, { recursive: true });

const HOLD = 130;
const GAP = 95;

// Uses a browser already on the machine rather than pulling a Playwright
// build, so the harness works without a 150MB download.
const launchArgs = ['--use-gl=angle', '--use-angle=gl', '--enable-unsafe-swiftshader'];
let browser = null;
for (const channel of ['msedge', 'chrome', 'chromium']) {
  try {
    browser = await chromium.launch({ channel, args: launchArgs });
    console.log(`browser: ${channel}`);
    break;
  } catch {
    // try the next one
  }
}
if (!browser) throw new Error('no usable Chromium-family browser found');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'load' });

const state = () => page.evaluate(() => window.__eve?.state ?? null);

// Wait for the character GLB + retargeting to finish.
await page.waitForFunction(() => window.__eve?.state?.characterLoaded === true, { timeout: 45000 })
  .catch(() => console.log('! character did not report loaded'));

const shot = async (name) => {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`  shot: ${name}.png`);
};

const hold = async (key, ms = HOLD) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(GAP);
};

const walk = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(GAP);
};

console.log('start:', JSON.stringify(await state()));
await shot('01-spawn');

// Walk south off the shore and through the first camera cuts.
await walk('KeyS', 2600);
const afterWalk = await state();
console.log('after walk S:', JSON.stringify(afterWalk));
await shot('02-after-walk');

// Dodge.
await hold('Space');
await page.waitForTimeout(400);
console.log('after dodge:', JSON.stringify(await state()));
await shot('03-dodge');

// Long run south to cross several zones, including the CCTV cross street.
await page.evaluate(() => window.__eve.teleport(0, 20));
await walk('KeyS', 4200);
const midTown = await state();
console.log('cross street:', JSON.stringify(midTown));
await shot('04-crossstreet-cctv');

// Bicycle.
await hold('KeyE');
await walk('KeyS', 2000);
console.log('riding:', JSON.stringify(await state()));
await shot('05-bicycle');
await hold('KeyE');

// Interior: the house, to check indoor lighting and the tighter shot.
await page.evaluate(() => window.__eve.teleport(-8, 24));
await page.waitForTimeout(700);
await walk('KeyD', 700);
console.log('house1:', JSON.stringify(await state()));
await shot('06-house-interior');

// Night ramp: accelerate the clock and watch the lighting change.
await page.evaluate(() => window.__eve.setTimeScale(600));
await page.waitForTimeout(4000);
await page.evaluate(() => window.__eve.setTimeScale(1));
console.log('night:', JSON.stringify(await state()));
await shot('07-full-night');

// The garage end of the slice.
await page.evaluate(() => window.__eve.teleport(24, -1));
await page.waitForTimeout(800);
await shot('08-garage');

const fps = await page.evaluate(() => window.__eve.engine.getFps());
console.log(`fps: ${fps.toFixed(1)}`);

if (errors.length) {
  console.log(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 12)) console.log('  -', e);
} else {
  console.log('\nno console errors');
}

await browser.close();
