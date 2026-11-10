import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pointPercents, emptyDoc, normalizeDoc, evaluateDoc, evaluateSeries, buildReport, reportSheet,
  finalVerdict, fileBase, fmtDate, unitLabel, outputRange, seriesHasData,
} from '../js/calsheet.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

/** Transmisor 0–10 bar, 4–20 mA, 5 puntos, tolerancia 0,5 % span. */
function sample() {
  const d = emptyDoc('t1');
  Object.assign(d, { tag: 'PT-101', date: '2026-11-10', tol: '0,5' });
  d.asFound.up = ['4,02', '8,05', '12,10', '16,08', '20,03'];
  d.asFound.down = ['4,04', '8,09', '12,13', '16,1', '20,03'];
  d.asLeft.up = ['4,00', '8,01', '12,00', '15,99', '20,00'];
  d.asLeft.down = ['4,01', '8,01', '12,02', '16,00', '20,00'];
  return d;
}

test('puntos repartidos por igual entre 0 y 100 %', () => {
  assert.deepEqual(pointPercents(3), [0, 50, 100]);
  assert.deepEqual(pointPercents(5), [0, 25, 50, 75, 100]);
  assert.deepEqual(pointPercents(11), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(pointPercents(4)[1], 33.333333);
  assert.throws(() => pointPercents(1), RangeError);
  assert.throws(() => pointPercents(12), RangeError);
});

test('transmisor: salida esperada lineal, error en % del span de salida e histéresis', () => {
  const ev = evaluateDoc(sample());
  assert.equal(ev.ok, true);
  assert.deepEqual(ev.found.points.map((p) => p.expected), [4, 8, 12, 16, 20]);
  assert.deepEqual(ev.found.points.map((p) => p.applied), [0, 2.5, 5, 7.5, 10]);
  close(ev.found.points[1].errUpSpan, 0.3125); // 0,05 mA / 16 mA
  close(ev.found.points[1].errDownSpan, 0.5625);
  close(ev.found.points[1].hysteresisSpan, 0.25);
  close(ev.found.maxErrorSpan, 0.8125);
  close(ev.found.maxHysteresisSpan, 0.25);
  // Sin U: aceptación simple.
  assert.deepEqual(ev.found.points.map((p) => p.verdict), ['pass', 'fail', 'fail', 'fail', 'pass']);
  assert.equal(ev.found.verdict, 'fail');
  assert.equal(ev.left.verdict, 'pass');
  assert.equal(finalVerdict(ev), 'pass');
  assert.ok(Number.isNaN(ev.found.tur));
});

test('justo en el límite cumple (sin errores de redondeo); sin as left manda el as found', () => {
  const d = sample();
  d.asFound.up = ['4,08', '8,08', '12,08', '16,08', '19,92']; // +0,5 % justo (12,08 − 12 = 0,0800000000000001)
  d.asFound.down = ['4,08', '8,08', '12,08', '16,08', '19,92'];
  const ev = evaluateDoc(d);
  assert.deepEqual(ev.found.points.map((p) => p.verdict), ['pass', 'pass', 'pass', 'pass', 'pass']);
  d.asFound.up[2] = '12,0801';
  assert.equal(evaluateDoc(d).found.points[2].verdict, 'fail');
  d.asLeft = { applied: Array(5).fill(''), up: Array(5).fill(''), down: Array(5).fill('') };
  assert.equal(finalVerdict(evaluateDoc(d)), 'fail');
});

test('U del patrón: se pasa a la salida, se combina con la de la salida y aplica ILAC-G8', () => {
  const d = sample();
  d.std.U = '0,005'; // bar -> 0,008 mA
  let ev = evaluateDoc(d);
  close(ev.U, 0.008);
  close(ev.found.USpan, 0.05);
  close(ev.found.tur, 10);
  d.std.outU = '0,006'; // mA
  ev = evaluateDoc(d);
  close(ev.U, 0.01); // √(0,008² + 0,006²)
  // 0,48 % span con U = 0,0625 %: cumple pero en zona de duda.
  d.asLeft.up[2] = '12,0768';
  ev = evaluateDoc(d);
  assert.equal(ev.left.points[2].verdict, 'pass-uncertain');
  assert.equal(finalVerdict(ev), 'pass-uncertain');
  // 0,52 %: no cumple, en zona de duda.
  d.asLeft.up[2] = '12,0832';
  assert.equal(evaluateDoc(d).left.points[2].verdict, 'fail-uncertain');
  // TUR bajo: aviso.
  d.std.U = '0,02'; d.std.outU = '';
  ev = evaluateDoc(d);
  close(ev.found.tur, 2.5);
  assert.ok(ev.warnings.some(([lvl, t]) => lvl === 'warn' && /\(TUR\) 2,5:1/.test(t)));
});

test('indicador: se lee en la unidad del patrón; patrón real distinto del nominal', () => {
  const d = emptyDoc('i1');
  Object.assign(d, { type: 'indicator', unit: 'pressure:psi', lo: '0', hi: '200', tol: '1', n: 3 });
  d.asFound = { applied: ['', '101', ''], up: ['0', '102', '199'], down: ['1', '103', ''] };
  d.asLeft = { applied: ['', '', ''], up: ['', '', ''], down: ['', '', ''] };
  const ev = evaluateDoc(d);
  assert.equal(ev.outRange, ev.inRange);
  assert.equal(ev.inRange.unit, 'psi');
  const p = ev.found.points;
  assert.deepEqual(p.map((x) => x.expected), [0, 101, 200]);
  close(p[1].errUpSpan, 0.5);
  close(p[1].errDownSpan, 1);
  close(p[2].errUpSpan, -0.5);
  assert.ok(Number.isNaN(p[2].hysteresisSpan));
  assert.equal(ev.found.complete, false);
  assert.equal(ev.found.filled, 3);
  assert.equal(ev.found.verdict, 'pass');
  assert.equal(ev.left.verdict, null);
});

test('tolerancia de histéresis opcional', () => {
  const d = sample();
  d.hystTol = '0,2';
  const ev = evaluateDoc(d);
  assert.equal(ev.found.points[0].verdict, 'pass'); // 0,125 %
  assert.equal(ev.found.points[1].hystFail, true); // 0,25 % > 0,2 %
  assert.equal(ev.found.points[4].verdict, 'pass');
});

test('rango invertido, salida personalizada y unidad escrita a mano', () => {
  const d = emptyDoc('x');
  Object.assign(d, { unit: 'custom', customUnit: 'kg', lo: '0', hi: '10', out: 'custom', outUnit: 'mA', outLo: '20', outHi: '4', n: 3 });
  assert.equal(unitLabel(d), 'kg');
  assert.deepEqual(outputRange(d), { lo: 20, hi: 4, unit: 'mA' });
  d.asFound.up = ['20', '12,08', '4'];
  const ev = evaluateDoc(d);
  assert.deepEqual(ev.found.points.map((p) => p.expected), [20, 12, 4]);
  close(ev.found.points[1].errUpSpan, 0.5);
});

test('errores de entrada y avisos', () => {
  assert.equal(evaluateDoc({ ...sample(), hi: '0' }).ok, false);
  assert.equal(evaluateDoc({ ...sample(), tol: '' }).ok, false);
  assert.equal(evaluateDoc({ ...sample(), out: 'custom', outLo: '4', outHi: '4' }).ok, false);
  const d = sample();
  d.std = { ...d.std, U: 'abc' };
  assert.equal(evaluateDoc(d).ok, false);
  const e = sample();
  e.asFound.up[0] = '4,0x';
  e.std = { ...e.std, due: '2026-10-01' };
  const ev = evaluateDoc(e);
  assert.ok(ev.warnings.some(([, t]) => /As found punto 1/.test(t)));
  assert.ok(ev.warnings.some(([lvl, t]) => lvl === 'bad' && /vencido.*01\/10\/2026/.test(t)));
  assert.equal(ev.found.points[0].filled, true); // la bajada sigue valiendo
});

test('normalizeDoc completa planillas viejas o rotas', () => {
  const d = normalizeDoc({ id: 'a', tag: 'FT-1', n: 3, asFound: { up: ['1'] }, std: { cert: 'C-1', U: 5 } });
  assert.equal(d.tag, 'FT-1');
  assert.equal(d.n, 3);
  assert.deepEqual(d.asFound.up, ['1', '', '']);
  assert.deepEqual(d.asLeft.down, ['', '', '']);
  assert.equal(d.std.cert, 'C-1');
  assert.equal(d.std.U, ''); // no era texto
  assert.equal(normalizeDoc(null).type, 'transmitter');
  assert.equal(normalizeDoc({ n: 99 }).n, 11);
  assert.equal(seriesHasData(d.asFound), true);
  assert.equal(seriesHasData(d.asLeft), false);
});

test('informe y hoja de Excel', () => {
  const d = sample();
  d.std = { ...d.std, desc: 'Calibrador', cert: 'C-123', U: '0,005' };
  d.notes = 'Línea 1\nLínea 2';
  const rep = buildReport(d, evaluateDoc(d));
  assert.equal(rep.verdict, 'pass');
  assert.equal(rep.subtitle, 'PT-101');
  const pairs = Object.fromEntries(rep.blocks.flatMap((b) => b.pairs));
  assert.equal(pairs['Rango'], '0 a 10 bar');
  assert.equal(pairs['Salida'], '4 a 20 mA');
  assert.equal(pairs['Nº de certificado'], 'C-123');
  assert.match(pairs['Regla de decisión'], /ILAC-G8.*TUR 10:1/);
  const sheet = reportSheet(rep);
  const flat = sheet.rows.map((r) => (r || []).map((c) => (c && typeof c === 'object' ? c.v : c)));
  const hdr = flat.findIndex((r) => r[0] === '%');
  assert.deepEqual(flat[hdr].slice(1, 3), ['Patrón (bar)', 'Esperado (mA)']);
  assert.deepEqual(flat[hdr + 2].slice(0, 9), [25, 2.5, 8, 8.05, 8.09, 0.3125, 0.5625, 0.25, 'No cumple']);
  assert.ok(flat.some((r) => r[0] === 'Línea 2'));
  assert.ok(flat.some((r) => r[0] === 'Resultado final' && r[1] === 'Cumple'));
  // Sin U: aceptación simple.
  const rep2 = buildReport(sample(), evaluateDoc(sample()));
  assert.match(Object.fromEntries(rep2.blocks.flatMap((b) => b.pairs))['Regla de decisión'], /Aceptación simple/);
});

test('nombres de archivo y fechas', () => {
  assert.equal(fileBase({ tag: 'PT-101 / línea 3', date: '2026-11-10' }), 'calibracion_PT-101-linea-3_2026-11-10');
  assert.equal(fileBase({ tag: '', date: '' }), 'calibracion_sin-tag');
  assert.equal(fmtDate('2026-11-10'), '10/11/2026');
  assert.equal(fmtDate(''), '');
});

test('evaluateSeries sin lecturas no da veredicto', () => {
  const s = evaluateSeries({
    inRange: { lo: 0, hi: 1 }, outRange: { lo: 4, hi: 20 }, percents: [0, 100], tol: 1,
    series: { applied: [NaN, NaN], up: [NaN, NaN], down: [NaN, NaN] },
  });
  assert.equal(s.verdict, null);
  assert.equal(s.filled, 0);
});
