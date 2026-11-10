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

import { tankRange } from '../js/level.js';
import { tankDiagram } from '../js/tools/level/diagram.js';

test('tanque de 9 m con la toma a 1 m y el transmisor en la brida: 0-8 m, PLC 1-9 o 0-8 + 1', () => {
  const r = tankRange({ config: 'open', top: 9, tap: 1, rho: 900 });
  close(r.lrv, 0);
  close(r.urv, G0 * 900 * 8);
  close(r.column.lrv, 0);
  close(r.column.urv, 8);
  assert.deepEqual(r.plc, { lo: 1, hi: 9, span: 8, offset: 1 });
  close(r.height, 8);
  close(r.deadZone.height, 1);
  close(r.deadZone.pct, 100 / 9);
  close(r.tapPct, 100 / 9);
  close(r.xmtrPct, 100 / 9);
  assert.equal(r.kind, 'none');
  close(r.at(0).level, 1);
  close(r.at(100).level, 9);
});

test('transmisor por debajo de la toma: supresión, y su % de altura', () => {
  // transmisor a 0,4 m del suelo con la toma a 1 m: la línea llena de líquido suma 0,6 m de columna
  const r = tankRange({ config: 'open', top: 9, tap: 1, xmtr: 0.4, rho: 900 });
  close(r.column.lrv, 0.6);
  close(r.column.urv, 8.6);
  close(r.xmtrPct, (0.4 / 9) * 100);
  assert.equal(r.kind, 'suppressed');
});

test('pierna húmeda con las cotas del tanque', () => {
  // toma LP a 9,5 m, toma HP a 1 m, transmisor en la brida HP: pierna de 8,5 m de agua
  const r = tankRange({ config: 'wet', top: 9, tap: 1, lpTap: 9.5, rho: 900, rhoRef: 1000 });
  close(r.column.lrv, -8.5 * (1000 / 900));
  close(r.lrv, -G0 * 1000 * 8.5);
  close(r.span, G0 * 900 * 8);
  close(r.lpPct, (9.5 / 9) * 100);
  assert.equal(r.kind, 'elevated');
  // sin cota LP se usa la superior
  const d = tankRange({ config: 'wet', top: 9, tap: 1, rho: 900, rhoRef: 1000 });
  close(d.lrv, -G0 * 1000 * 8);
  // y la cota del transmisor desplaza la pierna y la línea HP a la vez
  const x = tankRange({ config: 'wet', top: 9, tap: 1, xmtr: 0, rho: 900, rhoRef: 1000 });
  close(x.lrv, G0 * (900 * 1 - 1000 * 9));
});

test('dos sellos: la cota del transmisor no cambia el resultado', () => {
  const a = tankRange({ config: 'seals', top: 9, tap: 1, rho: 900, rhoFill: 960 });
  const b = tankRange({ config: 'seals', top: 9, tap: 1, xmtr: 0, rho: 900, rhoFill: 960 });
  close(a.lrv, b.lrv);
  close(a.lrv, -G0 * 960 * 8);
});

test('errores de las cotas del tanque', () => {
  const ok = { config: 'open', top: 9, tap: 1, rho: 900 };
  assert.ok(tankRange(ok));
  assert.throws(() => tankRange({ ...ok, top: 0 }), /cota superior/);
  assert.throws(() => tankRange({ ...ok, tap: -1 }), /referencia/);
  assert.throws(() => tankRange({ ...ok, tap: 9 }), /por debajo de la cota superior/);
  assert.throws(() => tankRange({ ...ok, xmtr: Infinity }), /transmisor/);
  assert.throws(() => tankRange({ ...ok, config: 'wet', rhoRef: 1000, lpTap: 5 }), /toma LP/);
  assert.throws(() => tankRange({ ...ok, config: 'zzz' }), /desconocido/);
});

test('el esquema del tanque pinta cotas y el fondo cónico, sin NaN', () => {
  const labels = { top: 'Sup. 9 m', tap: 'HP 1 m', bottom: '0 (ref.)', xmtr: 'TX 1 m', lp: '9 m' };
  const open = tankDiagram({ top: 9, tap: 1, xmtr: 1, labels });
  assert.match(open, /^<svg /);
  assert.ok(open.includes('Sup. 9 m') && open.includes('zona muerta') && open.includes('TX 1 m'));
  assert.ok(!open.includes('NaN') && !open.includes('LP'));
  const cone = tankDiagram({ top: 9, tap: 1, xmtr: 0.2, lpTap: 9.5, cone: true, lpKind: 'wet', labels });
  assert.ok(cone.includes('LP 9 m') && cone.includes('class="line lp wet"') && !cone.includes('NaN'));
  assert.notEqual(cone, tankDiagram({ top: 9, tap: 1, xmtr: 0.2, lpTap: 9.5, labels }));
  assert.ok(tankDiagram({ top: 9, tap: 1, xmtr: 50, labels: { ...labels, top: '<x>' } }).includes('&lt;x&gt;'));
});
