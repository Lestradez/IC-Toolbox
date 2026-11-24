import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  upVector, rotateForScreen, readInclination, slope, isLevel, lowPass,
  normalizeDeg, angleDiff, smoothAngle, cardinal, compassHeading, trueHeading, headingFromEvent,
  sensorSupport, createOrientationSource,
} from '../js/sensors.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('vector «arriba»: plano, de pie y sin romperse en beta = 90°', () => {
  const [x, y, z] = upVector(0, 0);
  near(x, 0); near(y, 0); near(z, 1);
  const p = upVector(90, 0); // de pie, en vertical
  near(p[0], 0); near(p[1], 1); near(p[2], 0);
  const f = upVector(180, 0); // boca abajo
  near(f[2], -1);
  const t = upVector(10, 20);
  near(Math.hypot(...t), 1);
});

test('inclinación plana: el borde que se levanta da ángulo positivo', () => {
  // Borde superior 5° más alto (beta = +5): b = +5.
  const r = readInclination(upVector(5, 0), 'flat');
  near(r.b, 5, 1e-9); near(r.a, 0, 1e-9);
  // Borde derecho 3° más alto (gamma = −3 según el estándar: gamma positivo baja el derecho).
  const s = readInclination(upVector(0, -3), 'flat');
  near(s.a, 3, 1e-9);
  assert.equal(readInclination(upVector(0, 0)).total, 0);
  assert.equal(readInclination(upVector(0, 0)).faceDown, false);
  assert.equal(readInclination(upVector(180, 0)).faceDown, true);
});

test('modo vertical: plomada y recuesto', () => {
  const ok = readInclination(upVector(90, 0), 'upright');
  near(ok.total, 0, 1e-9);
  // Beta = 100°: el teléfono se recuesta 10° hacia atrás y la pantalla mira hacia arriba.
  const lean = readInclination(upVector(80, 0), 'upright');
  near(lean.b, 10, 1e-9);
  assert.ok(isLevel(readInclination(upVector(90.3, 0.2), 'upright').total));
});

test('cero y pendiente', () => {
  const up = upVector(2, 1);
  const raw = readInclination(up, 'flat');
  const z = readInclination(up, 'flat', { a: raw.rawA, b: raw.rawB });
  near(z.total, 0, 1e-12);
  const s = slope(Math.atan(1 / 12) * 180 / Math.PI);
  near(s.pct, 8.3333, 1e-3); near(s.mmPerM, 83.333, 1e-2); near(s.ratio, 12, 1e-9);
  assert.equal(slope(0).ratio, Infinity);
  assert.equal(isLevel(0.5), true);
  assert.equal(isLevel(0.51), false);
});

test('pantalla girada: los ejes siguen a la pantalla', () => {
  assert.deepEqual(rotateForScreen([1, 2], 0), [1, 2]);
  assert.deepEqual(rotateForScreen([1, 2], 90), [-2, 1]);
  assert.deepEqual(rotateForScreen([1, 2], 180), [-1, -2]);
  assert.deepEqual(rotateForScreen([1, 2], 270), [2, -1]);
  assert.deepEqual(rotateForScreen([1, 2], -90), [2, -1]);
});

test('filtros', () => {
  assert.equal(lowPass(null, 4), 4);
  near(lowPass(0, 10, 0.3), 3);
  near(normalizeDeg(-10), 350); near(normalizeDeg(370), 10);
  near(angleDiff(350, 10), 20); near(angleDiff(10, 350), -20);
  near(smoothAngle(350, 10, 0.5), 0);
  near(smoothAngle(null, -90), 270);
  near(smoothAngle(0, 0), 0);
});

test('puntos cardinales en español', () => {
  assert.equal(cardinal(0), 'N'); assert.equal(cardinal(359), 'N');
  assert.equal(cardinal(90), 'E'); assert.equal(cardinal(180), 'S'); assert.equal(cardinal(270), 'O');
  assert.equal(cardinal(45), 'NE'); assert.equal(cardinal(247.5), 'OSO'); assert.equal(cardinal(337), 'NNO');
});

test('rumbo: teléfono acostado y de pie', () => {
  // Acostado: rumbo = 360 − alpha (convención estándar).
  near(compassHeading(0, 0, 0), 0);
  near(compassHeading(90, 0, 0), 270);
  near(compassHeading(270, 0, 0), 90);
  near(compassHeading(10, 5, -3), normalizeDeg(compassHeading(10, 5, -3))); // en rango
  // De pie (beta 90°) apunta la cámara trasera: sin giro, al norte; con alpha 90°, al oeste.
  near(compassHeading(0, 90, 0), 0, 1e-9);
  near(compassHeading(90, 90, 0), 270, 1e-9);
  // A 45° los dos criterios dan el mismo rumbo: sin saltos.
  near(compassHeading(40, 44, 0), compassHeading(40, 46, 0), 3);
});

test('declinación: este suma, oeste resta', () => {
  near(trueHeading(90, -8), 82);
  near(trueHeading(5, -8), 357);
  near(trueHeading(350, 15), 5);
  near(trueHeading(100), 100);
});

test('headingFromEvent: iOS, Android absoluto, relativo y vacío', () => {
  const ios = headingFromEvent({ type: 'deviceorientation', webkitCompassHeading: 123.4, webkitCompassAccuracy: 15 });
  assert.equal(ios.source, 'ios'); near(ios.heading, 123.4); assert.equal(ios.accuracy, 15);
  assert.equal(headingFromEvent({ webkitCompassHeading: 10, webkitCompassAccuracy: -1 }).uncalibrated, true);
  const abs = headingFromEvent({ type: 'deviceorientationabsolute', alpha: 90, beta: 0, gamma: 0 });
  assert.equal(abs.source, 'absolute'); near(abs.heading, 270);
  assert.equal(headingFromEvent({ type: 'deviceorientation', absolute: true, alpha: 270, beta: 0, gamma: 0 }).heading, 90);
  // Relativo: alpha no apunta al norte; no se debe mostrar un rumbo falso.
  assert.equal(headingFromEvent({ type: 'deviceorientation', absolute: false, alpha: 90, beta: 0, gamma: 0 }), null);
  assert.equal(headingFromEvent({ type: 'deviceorientationabsolute', alpha: null, beta: null, gamma: null }), null);
  assert.equal(headingFromEvent(null), null);
});

function fakeWin(opts = {}) {
  const handlers = {};
  const win = {
    isSecureContext: opts.secure ?? true,
    addEventListener: (t, f) => { (handlers[t] ||= []).push(f); },
    removeEventListener: (t, f) => { handlers[t] = (handlers[t] || []).filter((x) => x !== f); },
    handlers,
  };
  if (opts.api !== false) {
    win.DeviceOrientationEvent = opts.permission ? { requestPermission: async () => opts.permission } : function DeviceOrientationEvent() {};
  }
  if (opts.absolute) win.ondeviceorientationabsolute = null;
  return win;
}

test('sensorSupport y permiso de iOS', async () => {
  assert.equal(sensorSupport(fakeWin({ api: false })).api, false);
  assert.equal(sensorSupport(fakeWin({ permission: 'granted' })).needsPermission, true);
  assert.equal(sensorSupport(fakeWin({ absolute: true })).hasAbsolute, true);

  assert.equal(await createOrientationSource(fakeWin({ api: false })).start(() => {}), 'unsupported');
  assert.equal(await createOrientationSource(fakeWin({ secure: false })).start(() => {}), 'insecure');
  assert.equal(await createOrientationSource(fakeWin({ permission: 'denied' })).start(() => {}), 'denied');
  const bad = fakeWin(); bad.DeviceOrientationEvent = { requestPermission: async () => { throw new Error('sin gesto'); } };
  assert.equal(await createOrientationSource(bad).start(() => {}), 'denied');
});

test('fuente: escucha el evento correcto, ignora los vacíos y se detiene', async () => {
  const win = fakeWin({ permission: 'granted', absolute: true });
  const src = createOrientationSource(win, { noDataMs: 20 });
  const got = [];
  assert.equal(await src.start((e) => got.push(e), null, { absolute: true }), 'ok');
  assert.equal(win.handlers.deviceorientationabsolute.length, 1);
  assert.equal(win.handlers.deviceorientation, undefined);
  win.handlers.deviceorientationabsolute[0]({ alpha: null, beta: null, gamma: null }); // escritorio
  assert.equal(got.length, 0);
  win.handlers.deviceorientationabsolute[0]({ alpha: 1, beta: 2, gamma: 3 });
  assert.equal(got.length, 1);
  src.stop();
  assert.equal(win.handlers.deviceorientationabsolute.length, 0);

  // Sin eventos reales: avisa de «sin datos».
  const w2 = fakeWin();
  const s2 = createOrientationSource(w2, { noDataMs: 20 });
  let nodata = 0;
  await s2.start(() => {}, () => { nodata += 1; });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(nodata, 1);
  s2.stop();
  // Sin «absolute» pedido, usa deviceorientation.
  const w3 = fakeWin({ absolute: true });
  await createOrientationSource(w3).start(() => {}, null).then((r) => assert.equal(r, 'ok'));
  assert.equal(w3.handlers.deviceorientation.length, 1);
});
