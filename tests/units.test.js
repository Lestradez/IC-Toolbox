import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUANTITIES, convert, convertAll, mAToPercent, percentToMA, percentToPV, pvToPercent, namurStatus,
} from '../js/units.js';

const close = (actual, expected, relTol = 1e-6) => {
  const tol = Math.max(Math.abs(expected) * relTol, 1e-12);
  assert.ok(Math.abs(actual - expected) <= tol, `esperado ${expected}, obtenido ${actual}`);
};

// Valores de referencia: NIST SP 811 (Apéndice B) y definiciones exactas.
test('presión: equivalencias de referencia', () => {
  close(convert('pressure', 1, 'bar', 'psi'), 14.503773773);
  close(convert('pressure', 1, 'atm', 'kPa'), 101.325);
  close(convert('pressure', 1, 'psi', 'Pa'), 6894.757293);
  close(convert('pressure', 1, 'kgfcm2', 'bar'), 0.980665);
  close(convert('pressure', 1, 'inH2O', 'Pa'), 249.08891);
  close(convert('pressure', 1, 'inHg', 'Pa'), 3386.389, 1e-6);
  close(convert('pressure', 1, 'mmH2O', 'Pa'), 9.80665);
  close(convert('pressure', 760, 'torr', 'atm'), 1);
  close(convert('pressure', 1, 'mmHg', 'Pa'), 133.322387);
});

test('presión: ida y vuelta en todas las unidades', () => {
  const units = Object.keys(QUANTITIES.pressure.units);
  for (const a of units) for (const b of units) close(convert('pressure', convert('pressure', 3.7, a, b), b, a), 3.7, 1e-12);
});

test('temperatura', () => {
  close(convert('temperature', 0, 'C', 'F'), 32);
  close(convert('temperature', 100, 'C', 'F'), 212);
  close(convert('temperature', -40, 'C', 'F'), -40);
  close(convert('temperature', 25, 'C', 'K'), 298.15);
  close(convert('temperature', 0, 'K', 'R'), 0);
  close(convert('temperature', 32, 'F', 'R'), 491.67);
  assert.throws(() => convert('temperature', -300, 'C', 'K'), RangeError);
});

test('caudal', () => {
  close(convert('volFlow', 1, 'USgpm', 'm3/h'), 0.227124707);
  close(convert('volFlow', 1, 'm3/h', 'L/min'), 16.6666667);
  close(convert('volFlow', 1, 'bbl/d', 'm3/h'), 0.006624471);
  close(convert('volFlow', 1, 'cfm', 'm3/h'), 1.699010796);
  close(convert('massFlow', 1, 't/h', 'kg/h'), 1000);
  close(convert('massFlow', 1000, 'lb/h', 'kg/h'), 453.59237);
});

test('longitud', () => {
  close(convert('length', 1, 'ft', 'mm'), 304.8);
  close(convert('length', 1, 'in', 'mm'), 25.4);
});

test('convertAll devuelve todas las unidades', () => {
  const r = convertAll('length', 1, 'm');
  assert.equal(r.length, Object.keys(QUANTITIES.length.units).length);
});

test('errores de unidad', () => {
  assert.throws(() => convert('pressure', 1, 'foo', 'bar'));
  assert.throws(() => convert('nada', 1, 'a', 'b'));
});

test('señal 4-20 mA lineal', () => {
  close(mAToPercent(4), 0);
  close(mAToPercent(12), 50);
  close(mAToPercent(20), 100);
  close(percentToMA(25), 8);
  close(percentToPV(50, 0, 10), 5);
  close(percentToPV(50, -50, 150), 50);
  close(pvToPercent(5, 0, 10), 50);
  assert.throws(() => pvToPercent(1, 5, 5), RangeError);
});

test('señal 4-20 mA con raíz cuadrada (caudal por ΔP)', () => {
  // 25 % de ΔP -> 50 % de caudal
  close(percentToPV(25, 0, 100, true), 50);
  close(pvToPercent(50, 0, 100, true), 25);
  close(percentToPV(-5, 0, 100, true), 0);
});

test('NAMUR NE 43', () => {
  assert.equal(namurStatus(12), 'ok');
  assert.equal(namurStatus(3.9), 'bajo-rango');
  assert.equal(namurStatus(3.6), 'fallo-bajo');
  assert.equal(namurStatus(20.3), 'sobre-rango');
  assert.equal(namurStatus(21.5), 'fallo-alto');
});
