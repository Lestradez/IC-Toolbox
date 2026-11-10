#!/usr/bin/env node
// Regenera las capturas del manifest (diálogo de instalación de Chrome en Android).
//   npm ci && npx playwright install chromium && node scripts/make_screenshots.mjs
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build, ROOT } from './build.mjs';
import { serve } from './serve.mjs';

// 360 × 780 a 3x = 1080 × 2340, el tamaño declarado en manifest.webmanifest.
const SHOTS = [
  { name: 'inicio', hash: '#/' },
  { name: 'placa-orificio', hash: '#/orifice' },
  { name: 'conversor', hash: '#/units' },
];

const dir = await mkdtemp(join(tmpdir(), 'ict-shots-'));
await build(dir);
const server = await serve(dir);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await mkdir(join(ROOT, 'screenshots'), { recursive: true });
for (const s of SHOTS) {
  await page.goto(`http://127.0.0.1:${server.address().port}/${s.hash}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(ROOT, 'screenshots', `${s.name}.png`) });
}
await browser.close();
server.close();
await rm(dir, { recursive: true, force: true });
console.log(`${SHOTS.length} capturas en screenshots/`);
