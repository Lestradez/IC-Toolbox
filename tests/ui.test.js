import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, parseNum } from '../js/ui.js';

test('fmt: coma decimal y notación científica sin ceros de relleno', () => {
  assert.equal(fmt(0.01), '0,01');
  assert.equal(fmt(1e-6), '1e-6');
  assert.equal(fmt(1.01972e-5), '1,01972e-5');
  assert.equal(fmt(1.5e-5), '1,5e-5');
  assert.equal(fmt(2.5e9), '2,5e+9');
  assert.equal(fmt(20111.4), '20111,4');
  assert.equal(fmt(NaN), '—');
});

test('parseNum: coma o punto, negativos; ambiguo = NaN', () => {
  assert.equal(parseNum('1,5'), 1.5);
  assert.equal(parseNum(' -40 '), -40);
  assert.ok(Number.isNaN(parseNum('1.000,5')));
  assert.ok(Number.isNaN(parseNum('')));
});
