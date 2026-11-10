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

async function visibleView(page, expected) {
  if (expected) await page.waitForSelector(`[data-view="${expected}"]:not([hidden])`, { timeout: 5000 }).catch(() => {});
  return page.evaluate(() => [...document.querySelectorAll('[data-view]')].filter((el) => !el.hidden).map((el) => el.dataset.view));
}

test('cada herramienta carga sin errores', async () => {
  const { context, page, errors } = await newPage();
  for (const r of ROUTES) {
    await page.goto(base + r.hash);
    await page.waitForLoadState('load');
    assert.deepEqual(await visibleView(page, r.view), [r.view], `ruta ${r.hash}`);
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
    assert.deepEqual(await visibleView(page, r.view), [r.view], `offline ${r.hash}`);
  }
  await page.reload();
  await visibleView(page, 'orifice');
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

test('inicio: buscador, recientes y botón atrás', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base);
  assert.equal(await page.locator('#catalog a.tool').count(), 3);
  await page.fill('#search', 'psi');
  assert.deepEqual(await page.locator('#catalog a.tool strong').allTextContents(), ['Conversor de unidades']);
  await page.fill('#search', 'namur');
  await page.press('#search', 'Enter');
  assert.deepEqual(await visibleView(page, 'signal'), ['signal']);
  assert.equal(await page.textContent('#title'), 'Señal 4-20 mA');
  await page.click('#back');
  assert.deepEqual(await visibleView(page, 'home'), ['home']);
  await page.fill('#search', '');
  assert.deepEqual(await page.locator('#recent a.chip strong').allTextContents(), ['Señal 4-20 mA']);
  await page.fill('#search', 'zzz');
  assert.equal(await page.isVisible('#no-results'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('recuerda los datos y el tema al volver a abrir', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base + '#/units');
  await visibleView(page, 'units');
  await page.selectOption('#u-quantity', 'temperature');
  await page.selectOption('#u-from', 'C');
  await page.fill('#u-value', '-40');
  await page.goto(base + '#/signal');
  await visibleView(page, 'signal');
  await page.fill('#s-urv', '250');
  await page.fill('#s-ma', '20');
  await page.selectOption('#theme', 'dark');

  await page.reload();
  await visibleView(page, 'signal');
  assert.equal(await page.inputValue('#s-pv'), '250');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.inputValue('#theme'), 'dark');
  await page.goto(base + '#/units');
  await visibleView(page, 'units');
  assert.equal(await page.inputValue('#u-quantity'), 'temperature');
  assert.equal(await page.inputValue('#u-value'), '-40');
  assert.match(await page.textContent('#u-results'), /−?-?40/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('campo: barra de resultado, botón ±, error visible y deshacer', async () => {
  const { context, page, errors } = await newPage();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(base + '#/orifice');
  await visibleView(page, 'orifice');

  // Arriba del todo el resultado no se ve: la barra fija lo muestra.
  const bar = page.locator('section[data-view="orifice"] .result-bar');
  await bar.waitFor({ state: 'visible' });
  assert.equal(await bar.locator('.v').textContent(), (await page.textContent('#o-main')).trim());
  await page.fill('#o-d', '45');
  await page.waitForFunction(() => document.querySelector('.result-bar .v').textContent.startsWith('2'));
  await bar.click();
  await bar.waitFor({ state: 'hidden' });

  // Valores de ejemplo con deshacer.
  await page.click('#o-reset');
  assert.equal(await page.inputValue('#o-d'), '40');
  await page.click('#toast button');
  assert.equal(await page.inputValue('#o-d'), '45');

  // Botón ± en un campo que admite negativos.
  await page.goto(base + '#/units');
  await visibleView(page, 'units');
  await page.selectOption('#u-quantity', 'temperature');
  await page.selectOption('#u-from', 'C');
  await page.fill('#u-value', '40');
  await page.click('section[data-view="units"] .sign');
  assert.equal(await page.inputValue('#u-value'), '-40');
  assert.match(await page.textContent('#u-results'), /-40\s*°F/);

  // Número mal escrito: se explica, no se queda en blanco.
  await page.fill('#u-value', '1.000,5');
  assert.equal(await page.isVisible('#u-error'), true);

  // Tocar una fila copia el valor.
  await page.fill('#u-value', '100');
  await page.click('#u-results tr:nth-child(2)');
  await page.waitForFunction(() => /Copiado: 212/.test(document.getElementById('toast').textContent));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '212');
  assert.deepEqual(errors, []);
  await context.close();
});
