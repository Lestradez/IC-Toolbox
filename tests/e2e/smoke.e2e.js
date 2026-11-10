// Test de humo: abre la app publicada en un Chromium con tamaño de móvil y comprueba
// que cada herramienta carga sin errores, que funciona sin conexión y que el aviso de
// versión nueva actualiza la app.
//
//   npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { build } from '../../scripts/build.mjs';
import { serve } from '../../scripts/serve.mjs';

const ROUTES = [
  { hash: '#/', view: 'home' },
  { hash: '#/units', view: 'units' },
  { hash: '#/signal', view: 'signal' },
  { hash: '#/orifice', view: 'orifice' },
];

let dir;
let server;
let browser;
let base;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ict-e2e-'));
  await build(dir);
  server = await serve(dir);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
  await rm(dir, { recursive: true, force: true });
});

async function newPage() {
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { context, page, errors };
}

/** Espera a que el service worker controle la página (precache completo). */
async function waitForController(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 })
    .catch(() => page.reload());
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function visibleView(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-view]')].filter((el) => !el.hidden).map((el) => el.dataset.view));
}

test('cada herramienta carga sin errores', async () => {
  const { context, page, errors } = await newPage();
  for (const r of ROUTES) {
    await page.goto(base + r.hash);
    await page.waitForLoadState('load');
    assert.deepEqual(await visibleView(page), [r.view], `ruta ${r.hash}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `scroll horizontal en ${r.hash}`);
  }
  assert.match(await page.textContent('#o-main'), /\d/, 'la placa orificio no muestra resultado');
  assert.deepEqual(errors, []);
  await context.close();
});

test('funciona sin conexión', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base);
  await waitForController(page);
  await context.setOffline(true);
  for (const r of ROUTES) {
    await page.goto(base + r.hash);
    assert.deepEqual(await visibleView(page), [r.view], `offline ${r.hash}`);
  }
  await page.reload();
  assert.match(await page.textContent('#o-main'), /\d/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('el aviso de versión nueva actualiza la app', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base);
  await waitForController(page);
  assert.equal(await page.isHidden('#update'), true, 'el aviso no debe salir en la primera instalación');
  const oldVersion = await page.textContent('#version');

  // Publica una «versión nueva» cambiando el service worker y la versión del pie.
  const swPath = join(dir, 'sw.js');
  const appPath = join(dir, 'js', 'app.js');
  const sw = await readFile(swPath, 'utf8');
  const [, oldCache] = sw.match(/const CACHE_VERSION = "([^"]+)"/);
  await writeFile(swPath, sw.replace(oldCache, `${oldCache}-next`));
  await writeFile(appPath, (await readFile(appPath, 'utf8')).replace(oldVersion, 'nueva'));

  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector('#update:not([hidden])', { timeout: 10000 });
  await Promise.all([page.waitForEvent('load'), page.click('#update-btn')]);
  assert.equal(await page.textContent('#version'), 'nueva', 'tras actualizar debe verse la versión nueva');
  assert.deepEqual(await page.evaluate(() => caches.keys()), [`${oldCache}-next`]);
  assert.deepEqual(errors, []);
  await context.close();
});
