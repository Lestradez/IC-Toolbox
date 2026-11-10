import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaconUrl, describeError, enqueue, createAnalytics } from '../js/analytics.js';
import { reportUrl, formUrl } from '../js/report.js';

// ui.js usa localStorage: un doble en memoria.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

test('beaconUrl: solo ruta, título, evento y versión', () => {
  const u = new URL(beaconUrl('demo', { path: '/orifice', title: 'Placa orificio', version: '0.3.0 · ab12' }));
  assert.equal(u.origin, 'https://demo.goatcounter.com');
  assert.equal(u.pathname, '/count');
  assert.equal(u.searchParams.get('p'), '/orifice');
  assert.equal(u.searchParams.get('t'), 'Placa orificio');
  assert.equal(u.searchParams.get('e'), null);
  assert.equal(u.searchParams.get('q'), 'v=0.3.0 · ab12');
  const e = new URL(beaconUrl('demo', { path: 'report/units', event: true }));
  assert.equal(e.searchParams.get('e'), 'true');
});

test('describeError: recorta y quita ruta y parámetros del archivo', () => {
  assert.equal(describeError('x is not defined', 'https://a.io/IC-Toolbox/js/tools/units/view.js?v=1#h', 42), 'x is not defined @view.js:42');
  assert.equal(describeError('a'.repeat(300)).length, 100);
  assert.equal(describeError('', ''), 'error');
});

test('enqueue: conserva solo los últimos 30', () => {
  let q = [];
  for (let i = 0; i < 40; i++) q = enqueue(q, i);
  assert.equal(q.length, 30);
  assert.equal(q[0], 10);
});

function make(over = {}) {
  store.clear();
  const sent = [];
  let online = true;
  const a = createAnalytics({
    code: 'demo', version: 'v1', getEnabled: () => true,
    isOnline: () => online,
    send: async (url) => { sent.push(url); return true; },
    ...over,
  });
  return { a, sent, setOnline: (v) => { online = v; } };
}

test('sin código no se envía nada', async () => {
  const { a, sent } = make({ code: '' });
  await a.pageview('/units', 'x');
  await a.event('report/units');
  await a.error('units', 'boom');
  assert.equal(sent.length, 0);
});

test('respeta la preferencia de desactivar', async () => {
  const { a, sent } = make({ getEnabled: () => false });
  await a.pageview('/units', 'x');
  assert.equal(sent.length, 0);
});

test('offline: encola y envía al volver la conexión', async () => {
  const { a, sent, setOnline } = make();
  setOnline(false);
  await a.pageview('/signal', 'Señales');
  await a.pageview('/units', 'Unidades');
  assert.equal(sent.length, 0);
  setOnline(true);
  await a.flush();
  assert.equal(sent.length, 2);
  await a.flush();
  assert.equal(sent.length, 2, 'la cola queda vacía');
});

test('un envío fallido se reencola', async () => {
  let ok = false;
  const { a, sent } = make({ send: async (u) => { sent.push(u); return ok; } });
  await a.pageview('/units', 'x');
  ok = true;
  await a.flush();
  assert.equal(sent.length, 2);
});

test('errores: máximo 5 por sesión, con herramienta en el nombre', async () => {
  const { a, sent } = make();
  for (let i = 0; i < 8; i++) await a.error('orifice', `fallo ${i}`, 'http://x/js/a.js', 3);
  assert.equal(sent.length, 5);
  const p = new URL(sent[0]).searchParams;
  assert.equal(p.get('p'), 'error/orifice/fallo 0 @a.js:3');
  assert.equal(p.get('e'), 'true');
});

test('reportUrl: issue prellenado con herramienta y versión', () => {
  const u = new URL(reportUrl({
    repo: 'Lestradez/IC-Toolbox', tool: 'orifice', toolTitle: 'Placa orificio',
    version: '0.3.0 · ab12', userAgent: 'UA/1', online: false,
  }));
  assert.equal(u.origin + u.pathname, 'https://github.com/Lestradez/IC-Toolbox/issues/new');
  assert.equal(u.searchParams.get('title'), '[Placa orificio] ');
  const body = u.searchParams.get('body');
  assert.match(body, /Herramienta: Placa orificio \(#\/orifice\)/);
  assert.match(body, /Versión: 0\.3\.0 · ab12/);
  assert.match(body, /Conexión: sin conexión/);
  assert.match(body, /Navegador: UA\/1/);
  assert.match(reportUrl({ repo: 'a/b', tool: '', toolTitle: '', version: 'dev' }), /Inicio/);
});

test('formUrl: prellena solo los campos configurados; vacío sin formulario', () => {
  const base = { tool: 'units', toolTitle: 'Conversor de unidades', version: '0.3.0', userAgent: 'UA' };
  assert.equal(formUrl({ url: '', fields: {}, ...base }), '');
  const u = new URL(formUrl({ url: 'https://docs.google.com/forms/d/e/X/viewform', fields: { tool: 'entry.1', version: 'entry.2', browser: '' }, ...base }));
  assert.equal(u.searchParams.get('usp'), 'pp_url');
  assert.equal(u.searchParams.get('entry.1'), 'Conversor de unidades');
  assert.equal(u.searchParams.get('entry.2'), '0.3.0');
  assert.equal([...u.searchParams.keys()].length, 3);
});
