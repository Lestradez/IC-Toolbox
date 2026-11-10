import test from 'node:test';
import assert from 'node:assert/strict';
import { levelDP, levelRange, densityToKgM3, CONFIGS, G0 } from '../js/level.js';
import { convert } from '../js/units.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const IN = 0.0254;
/** Pa -> inH2O (4 °C, convención del conversor). */
const inH2O = (pa) => convert('pressure', pa, 'Pa', 'inH2O');
const sg = (x) => densityToKgM3(x, 'SG');

// Los casos siguientes están calculados a mano (ΔP = SG·h en inH₂O, que es la forma en que los
// manuales de los transmisores plantean los ejemplos), no copiados de una hoja de datos.

test('tanque abierto, transmisor al nivel de la toma: sin supresión', () => {
  const r = levelRange({ config: 'open', lo: 0, hi: 100 * IN, tap: 0, rho: sg(0.9) });
  close(inH2O(r.lrv), 0);
  close(inH2O(r.urv), 90);
  assert.equal(r.kind, 'none');
});

test('tanque abierto con el transmisor 20 in por debajo de la toma: cero suprimido', () => {
  // la línea llena de líquido (SG 0,9) suma 18 inH2O a HP ya con el tanque vacío
  const r = levelRange({ config: 'open', lo: 0, hi: 100 * IN, tap: 0, rho: sg(0.9), offset: 20 * IN });
  close(inH2O(r.lrv), 18);
  close(inH2O(r.urv), 108);
  close(inH2O(r.span), 90);
  assert.equal(r.kind, 'suppressed');
});

test('0 % por encima de la toma (el transmisor lee a partir de cierta altura)', () => {
  // toma a 500 mm, rango 1000-3000 mm, agua: LRV = 500 mmH2O, URV = 2500 mmH2O
  const r = levelRange({ config: 'open', lo: 1, hi: 3, tap: 0.5, rho: 1000 });
  close(convert('pressure', r.lrv, 'Pa', 'mmH2O'), 500);
  close(convert('pressure', r.urv, 'Pa', 'mmH2O'), 2500);
  assert.equal(r.kind, 'suppressed');
});

test('pierna húmeda: cero elevado', () => {
  // SG 0,9, nivel 0-150 in, tomas a 170 in, pierna de agua, transmisor a la altura de la toma HP
  const r = levelRange({ config: 'wet', lo: 0, hi: 150 * IN, tap: 0, rho: sg(0.9), taps: 170 * IN, rhoRef: sg(1) });
  close(inH2O(r.lrv), -170);
  close(inH2O(r.urv), 135 - 170);
  close(inH2O(r.span), 135);
  assert.equal(r.kind, 'elevated');
});

test('pierna húmeda con el transmisor por debajo: la elevación crece y la supresión HP compensa', () => {
  // 30 in por debajo: la pierna LP mide 170 + 30 = 200 in; la línea HP suma 0,9 · 30 = 27 in
  const r = levelRange({ config: 'wet', lo: 0, hi: 150 * IN, tap: 0, rho: sg(0.9), taps: 170 * IN, rhoRef: sg(1), offset: 30 * IN });
  close(inH2O(r.lrv), 27 - 200);
  close(inH2O(r.span), 135);
});

test('pierna seca: solo cuenta la columna del proceso', () => {
  const r = levelRange({ config: 'dry', lo: 0, hi: 2, tap: 0, rho: 800, taps: 3 });
  close(r.lrv, 0);
  close(r.urv, G0 * 800 * 2);
});

test('dos sellos remotos: ΔP = ρ·h − ρ_relleno·distancia entre tomas', () => {
  // SG 1,0, 0-100 in, tomas a 120 in, relleno SG 0,93: LRV = −111,6 inH2O
  const r = levelRange({ config: 'seals', lo: 0, hi: 100 * IN, tap: 0, rho: sg(1), taps: 120 * IN, rhoFill: sg(0.93) });
  close(inH2O(r.lrv), -0.93 * 120);
  close(inH2O(r.urv), 100 - 0.93 * 120);
  assert.equal(r.kind, 'elevated');
});

test('sellos remotos: la altura del transmisor no influye', () => {
  const base = { config: 'seals', lo: 0, hi: 2, tap: 0, rho: 900, taps: 2.5, rhoFill: 960 };
  const a = levelRange({ ...base, offset: 0 });
  const b = levelRange({ ...base, offset: 4 });
  close(a.lrv, b.lrv);
  close(a.urv, b.urv);
});

test('sello remoto en tanque abierto con el transmisor por debajo: supresión por el relleno', () => {
  // transmisor 1 m por debajo del sello, relleno 960 kg/m3, tanque 0-2 m de líquido a 900 kg/m3
  const r = levelRange({ config: 'open-seal', lo: 0, hi: 2, tap: 0, rho: 900, rhoFill: 960, offset: 1 });
  close(r.lrv, G0 * 960);
  close(r.urv, G0 * (960 + 1800));
});

test('puntos intermedios y ΔP en el origen', () => {
  const r = levelRange({ config: 'wet', lo: 0, hi: 150 * IN, tap: 0, rho: sg(0.9), taps: 170 * IN, rhoRef: sg(1) });
  close(inH2O(r.at(50).dp), (-170 + -35) / 2);
  close(r.at(0).dp, r.lrv);
  close(r.at(100).dp, r.urv);
  close(r.at(50).level, 75 * IN);
  close(levelDP({ level: 1, tap: 0.4, rho: 1000 }), G0 * 600);
});

test('errores de entrada', () => {
  const ok = { config: 'open', lo: 0, hi: 1, tap: 0, rho: 1000 };
  assert.ok(levelRange(ok));
  assert.throws(() => levelRange({ ...ok, config: 'nada' }), /desconocido/);
  assert.throws(() => levelRange({ ...ok, rho: 0 }), /densidad/);
  assert.throws(() => levelRange({ ...ok, hi: 0 }), /100 %/);
  assert.throws(() => levelRange({ ...ok, lo: NaN }), /0 %/);
  assert.throws(() => levelRange({ ...ok, lo: -0.1 }), /por debajo de la toma/);
  assert.throws(() => levelRange({ ...ok, config: 'wet', taps: 2 }), /pierna húmeda/);
  assert.throws(() => levelRange({ ...ok, config: 'wet', taps: 0, rhoRef: 1000 }), /entre tomas/);
  assert.throws(() => levelRange({ ...ok, config: 'wet', taps: 0.5, rhoRef: 1000 }), /toma LP/);
  assert.throws(() => levelRange({ ...ok, config: 'open-seal' }), /relleno/);
});

test('unidades de densidad', () => {
  close(densityToKgM3(0.9, 'SG'), 900);
  close(densityToKgM3(0.85, 'g/cm3'), 850);
  close(densityToKgM3(62.4, 'lb/ft3'), 999.5, 1e-3);
  assert.throws(() => densityToKgM3(1, 'x'));
  for (const c of Object.values(CONFIGS)) assert.ok(c.label && c.hint);
});
