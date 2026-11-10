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
import { TOOLS } from '../../js/tools/registry.js';

const ROUTES = [
  { hash: '#/', view: 'home' },
  { hash: '#/units', view: 'units' },
  { hash: '#/signal', view: 'signal' },
  { hash: '#/orifice', view: 'orifice' },
  { hash: '#/temperature', view: 'temperature' },
  { hash: '#/calibration', view: 'calibration' },
  { hash: '#/level', view: 'level' },
  { hash: '#/pid', view: 'pid' },
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
  await page.goto(base + '#/calibration');
  await page.waitForSelector('[data-view="calibration"]:not([hidden])');
  assert.equal(await page.textContent('#c-main'), '+0,200 % span', 'estadística de calibración');
  await page.goto(base + '#/level');
  await page.waitForSelector('[data-view="level"]:not([hidden])');
  assert.match(await page.textContent('#l-main'), /^-166,713 … -34,3233 mbar$/, 'nivel por ΔP');
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
  await page.goto(`${base}#/orifice`);
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
  assert.equal(await page.locator('#catalog a.tool').count(), TOOLS.length);
  await page.fill('#search', 'psi');
  assert.deepEqual(await page.locator('#catalog a.tool strong').allTextContents(), ['Conversor de unidades', 'Escalado de señales']);
  await page.fill('#search', 'namur');
  await page.press('#search', 'Enter');
  assert.deepEqual(await visibleView(page, 'signal'), ['signal']);
  assert.equal(await page.textContent('#title'), 'Escalado de señales');
  await page.click('#back');
  assert.deepEqual(await visibleView(page, 'home'), ['home']);
  await page.fill('#search', '');
  assert.deepEqual(await page.locator('#recent a.chip strong').allTextContents(), ['Escalado de señales']);
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
  await page.fill('#s-b-hi', '250');
  await page.fill('#s-in', '20');
  await page.selectOption('#theme', 'dark');

  await page.reload();
  await visibleView(page, 'signal');
  assert.equal(await page.inputValue('#s-out'), '250');
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

test('escalado de señales: presets, cambio de unidad y raíz cuadrada', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base + '#/signal');
  await visibleView(page, 'signal');
  // por defecto 4-20 mA -> 0-100 kPa con 12 mA
  assert.equal(await page.inputValue('#s-out'), '50');
  assert.equal(await page.inputValue('#s-a-preset'), '4-20mA');
  // preset de tensión en la entrada
  await page.selectOption('#s-a-preset', '0-10V');
  await page.fill('#s-in', '5');
  assert.equal(await page.inputValue('#s-out'), '50');
  assert.equal(await page.inputValue('#s-pct'), '50');
  // salida en psi: el rango se convierte (0-100 kPa -> 0-14,5038 psi)
  await page.selectOption('#s-b-unit', 'psi');
  assert.match(await page.inputValue('#s-b-hi'), /^14[.,]5/);
  assert.equal(await page.inputValue('#s-pct'), '50');
  // salida neumática estándar 3-15 psi
  await page.selectOption('#s-b-preset', '3-15psi');
  assert.equal(await page.inputValue('#s-out'), '9');
  // magnitud libre + raíz cuadrada
  await page.selectOption('#s-b-qty', 'custom');
  await page.fill('#s-b-custom', 'm3/h');
  await page.fill('#s-b-lo', '0');
  await page.fill('#s-b-hi', '100');
  await page.check('#s-sqrt');
  await page.fill('#s-pct', '25');
  assert.equal(await page.inputValue('#s-out'), '50');
  assert.equal(await page.isVisible('#s-b-custom'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('RTD y termopares: valores de tabla en los dos sentidos', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(`${base}#/temperature`);
  await page.waitForSelector('[data-view="temperature"]:not([hidden]) #t-main');
  // Pt100 a 100 °C = 138,5055 Ω (IEC 60751).
  await page.waitForFunction(() => document.getElementById('t-main').textContent.startsWith('138,50'));
  await page.fill('#t-rR', '175,86');
  assert.match(await page.inputValue('#t-rT'), /^200,0[01]$/);

  // Termopar K a 400 °C con junta fría a 25 °C: 16,397 − 1,000 = 15,397 mV en bornes.
  await page.click('.tabs [data-mode="tc"]');
  assert.equal(await page.inputValue('#t-tE'), '15,397');
  await page.fill('#t-cj', '0');
  await page.fill('#t-tE', '41,276');
  assert.match(await page.inputValue('#t-tT'), /^(999,99|1000,0[01])$/);
  assert.match(await page.textContent('#t-table'), /mA|20,00/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('sintonía PID: siempre muestra P, I y D, y explica la D = 0', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(`${base}#/pid`);
  await page.waitForSelector('[data-view="pid"]:not([hidden]) #p-load .pl-row');
  // Ejemplo: PI por Lambda en PIDE dependiente → D = 0 con su motivo.
  assert.equal(await page.locator('#p-load .pl-row').count(), 3);
  assert.match(await page.textContent('#p-load'), /PGain[\s\S]*IGain[\s\S]*DGain/);
  assert.match(await page.textContent('#p-load'), /D = 0 porque elegiste PI/);
  await page.selectOption('#p-type', 'PID');
  assert.equal(await page.locator('#p-load .pl-why:not([hidden])').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Reportar un problema»: sin formulario abre GitHub con herramienta y versión', async () => {
  const { context, page, errors } = await newPage();
  await page.goto(base + '#/orifice');
  await visibleView(page, 'orifice');
  await page.evaluate(() => { window.open = (u) => { window.__opened = u; }; });
  await page.click('#report');
  const url = new URL(await page.evaluate(() => window.__opened));
  assert.equal(url.pathname, '/Lestradez/IC-Toolbox/issues/new');
  assert.equal(url.searchParams.get('title'), '[Placa orificio] ');
  assert.match(url.searchParams.get('body'), /Herramienta: Placa orificio \(#\/orifice\)/);
  assert.match(url.searchParams.get('body'), /Versión: /);
  assert.equal(await page.isHidden('#report-dialog'), true);
  assert.equal(await page.isHidden('#stats-row'), true, 'en localhost no se ofrece el interruptor');
  assert.deepEqual(errors, []);
  await context.close();
});

test('«Reportar un problema»: con formulario muestra el popup con las dos opciones', async () => {
  const { context, page, errors } = await newPage();
  await page.route('**/js/config.js', async (route) => {
    const res = await route.fetch();
    const body = (await res.text())
      .replace("FORM_URL = ''", "FORM_URL = 'https://docs.google.com/forms/d/e/X/viewform'")
      .replace("{ tool: '', version: '', browser: '' }", "{ tool: 'entry.1', version: 'entry.2', browser: '' }");
    await route.fulfill({ response: res, body });
  });
  await page.goto(base + '#/signal');
  await visibleView(page, 'signal');
  await page.click('#report');
  await page.waitForSelector('#report-dialog[open]');
  assert.equal(await page.isVisible('#report-github'), true);
  const form = new URL(await page.getAttribute('#report-form', 'href'));
  assert.equal(form.searchParams.get('entry.1'), 'Escalado de señales');
  assert.match(form.searchParams.get('entry.2'), /\S/);
  assert.match(await page.getAttribute('#report-github', 'href'), /github\.com\/Lestradez\/IC-Toolbox\/issues\/new/);
  await page.click('#report-close');
  assert.equal(await page.isHidden('#report-dialog'), true);
  assert.deepEqual(errors, []);
  await context.close();
});
