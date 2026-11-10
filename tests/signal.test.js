import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNAL_QUANTITIES, PRESETS, presetById, matchPreset, convertQty, convertRange,
  scale, unscale, isLoopRange, signalStatus,
} from '../js/signal.js';
import { QUANTITIES } from '../js/units.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('cada preset usa una magnitud y una unidad que existen', () => {
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(SIGNAL_QUANTITIES[p.qty], `magnitud ${p.qty}`);
    assert.ok(SIGNAL_QUANTITIES[p.qty].units[p.unit], `unidad ${p.unit}`);
    assert.ok(p.lo < p.hi || p.lo > p.hi);
    assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
    ids.add(p.id);
  }
});

test('las magnitudes del conversor se reutilizan tal cual', () => {
  assert.equal(SIGNAL_QUANTITIES.pressure, QUANTITIES.pressure);
});

test('conversión de las magnitudes propias del escalado', () => {
  close(convertQty('current', 4, 'mA', 'A'), 0.004);
  close(convertQty('current', 4000, 'uA', 'mA'), 4);
  close(convertQty('voltage', 2500, 'mV', 'V'), 2.5);
  close(convertQty('capacitance', 1000, 'pF', 'nF'), 1);
  close(convertQty('resistance', 2.2, 'kohm', 'ohm'), 2200);
  close(convertQty('pressure', 1, 'bar', 'kPa'), 100);
  assert.throws(() => convertQty('current', 1, 'mA', 'V'));
  assert.throws(() => convertQty('nada', 1, 'a', 'b'));
});

test('escalado 4-20 mA -> 0-10 V y 0-10 V -> 3-15 psi', () => {
  const ma = presetById('4-20mA');
  const v = presetById('0-10V');
  const psi = presetById('3-15psi');
  close(scale(12, ma, v).out, 5);
  close(scale(4, ma, v).pct, 0);
  close(scale(20, ma, v).out, 10);
  close(scale(5, v, psi).out, 9);
  close(scale(0, v, psi).out, 3);
  close(unscale(9, v, psi).in, 5);
});

test('escalado con rango de salida invertido', () => {
  // 4-20 mA -> 100..0 % (acción inversa)
  close(scale(4, { lo: 4, hi: 20 }, { lo: 100, hi: 0 }).out, 100);
  close(scale(12, { lo: 4, hi: 20 }, { lo: 100, hi: 0 }).out, 50);
});

test('escalado con raíz cuadrada (caudal por ΔP)', () => {
  const ma = { lo: 4, hi: 20 };
  const q = { lo: 0, hi: 100 };
  // 25 % de ΔP -> 50 % de caudal -> 8 mA
  close(scale(8, ma, q, true).out, 50);
  close(unscale(50, ma, q, true).in, 8);
  close(scale(4, ma, q, true).out, 0);
  close(scale(20, ma, q, true).out, 100);
});

test('ida y vuelta es la identidad', () => {
  const a = presetById('1-5V');
  const b = { lo: -40, hi: 250 };
  for (const sqrt of [false, true]) {
    for (const x of [1, 2.7, 5]) {
      const { out } = scale(x, a, b, sqrt);
      close(unscale(out, a, b, sqrt).in, x, 1e-9);
    }
  }
});

test('capacidad en pF (sensor capacitivo) a nivel', () => {
  // 120–480 pF equivalen a 0–2,5 m de nivel; 300 pF = 50 %
  close(scale(300, { lo: 120, hi: 480 }, { lo: 0, hi: 2.5 }).out, 1.25);
  const nf = convertRange('capacitance', { lo: 120, hi: 480 }, 'pF', 'nF');
  close(nf.lo, 0.12);
  close(nf.hi, 0.48);
});

test('cambiar de unidad convierte el rango sin alterar el %', () => {
  const bar = { lo: 0, hi: 10 };
  const psi = convertRange('pressure', bar, 'bar', 'psi');
  close(psi.hi, 145.03773773, 1e-8);
  close(scale(5, bar, { lo: 0, hi: 1 }).pct, 50);
  close(scale(psi.hi / 2, psi, { lo: 0, hi: 1 }).pct, 50);
  // temperatura con offset
  const f = convertRange('temperature', { lo: 0, hi: 100 }, 'C', 'F');
  close(f.lo, 32);
  close(f.hi, 212);
});

test('matchPreset reconoce rangos equivalentes y los demás no', () => {
  assert.equal(matchPreset('current', 'mA', 4, 20), '4-20mA');
  assert.equal(matchPreset('pressure', 'psi', 3, 15), '3-15psi');
  assert.equal(matchPreset('pressure', 'psi', 3, 16), null);
  assert.equal(matchPreset('voltage', 'mA', 0, 10), null);
});

test('3-15 psi y 0,2-1 bar son casi equivalentes (≈ 0,2068–1,034 bar)', () => {
  const lo = convertQty('pressure', 3, 'psi', 'bar');
  const hi = convertQty('pressure', 15, 'psi', 'bar');
  assert.ok(Math.abs(lo - 0.2) < 0.01 && Math.abs(hi - 1) < 0.04);
});

test('NAMUR solo aplica al rango 4-20 mA, también en µA o A', () => {
  assert.ok(isLoopRange('current', 'mA', 4, 20));
  assert.ok(isLoopRange('current', 'A', 0.004, 0.02));
  assert.ok(!isLoopRange('current', 'mA', 0, 20));
  assert.ok(!isLoopRange('voltage', 'V', 4, 20));
  const loop = { qty: 'current', unit: 'mA', lo: 4, hi: 20 };
  assert.equal(signalStatus(0, { ...loop, value: 3.5 }).status, 'fallo-bajo');
  assert.equal(signalStatus(0, { ...loop, value: 21.5 }).status, 'fallo-alto');
  assert.equal(signalStatus(50, { ...loop, value: 12 }).status, 'ok');
  const v = { qty: 'voltage', unit: 'V', lo: 0, hi: 10 };
  assert.equal(signalStatus(-5, { ...v, value: -0.5 }).status, 'bajo-rango');
  assert.equal(signalStatus(105, { ...v, value: 10.5 }).status, 'sobre-rango');
  assert.equal(signalStatus(50, { ...v, value: 5 }).status, 'ok');
});

test('rango degenerado lanza error', () => {
  assert.throws(() => scale(1, { lo: 5, hi: 5 }, { lo: 0, hi: 1 }), RangeError);
});
