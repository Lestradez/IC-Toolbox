import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReadings, stats, tTwoSided, coverageFactor, calibrationPoint, termAbs, totalProbableError,
  calibrationRun, worstVerdict,
} from '../js/calibration.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('lectura de listas: coma decimal, espacios, saltos de línea y punto y coma', () => {
  assert.deepEqual(parseReadings('4,01 4.02\n4,03;4.04,  −1,5').values, [4.01, 4.02, 4.03, 4.04, -1.5]);
  assert.deepEqual(parseReadings('  ').values, []);
  const r = parseReadings('1 abc 2 1,2,3');
  assert.deepEqual(r.values, [1, 2]);
  assert.deepEqual(r.invalid, ['abc', '1,2,3']);
});

test('estadística: media, s muestral, σ poblacional y tipo A (comprobado con Python statistics)', () => {
  const st = stats([4.012, 4.008, 4.015, 4.010, 4.011]);
  assert.equal(st.n, 5);
  close(st.mean, 4.0112);
  close(st.s, 0.0025884358211088264, 1e-12);
  close(st.sigmaPop, 0.0023151673805579284, 1e-12);
  close(st.uA, 0.0011575836902789642, 1e-12);
  close(st.range, 0.007);
  assert.ok(Number.isNaN(stats([3]).s));
  assert.equal(stats([]).n, 0);
});

test('t de Student al 95 % (tablas de libros de texto)', () => {
  for (const [nu, t] of [[1, 12.706], [4, 2.776], [10, 2.228], [30, 2.042]]) {
    close(coverageFactor(nu, 0.95), t, 2e-4);
    close(tTwoSided(t, nu), 0.95, 1e-4);
  }
});

test('factor de cobertura al 95,45 % (GUM, tabla G.2)', () => {
  const G2 = [[1, 13.97], [2, 4.53], [3, 3.31], [4, 2.87], [5, 2.65], [6, 2.52], [7, 2.43], [8, 2.37],
    [9, 2.32], [10, 2.28], [20, 2.13], [50, 2.05], [100, 2.025]];
  for (const [nu, k] of G2) close(coverageFactor(nu), k, 3e-3);
  close(coverageFactor(Infinity), 2.000, 1e-3);
  assert.ok(Number.isNaN(coverageFactor(0)));
  assert.ok(Number.isNaN(coverageFactor(NaN)));
});

test('calibración: error en % span y % lectura, incertidumbre solo tipo A', () => {
  // Transmisor 0-10 bar, patrón 5 bar, cinco lecturas.
  const r = calibrationPoint({ readings: [5.02, 5.03, 5.01, 5.02, 5.02], ref: 5, lo: 0, hi: 10 });
  close(r.mean, 5.02);
  close(r.error, 0.02);
  close(r.errorSpan, 0.2);
  close(r.errorReading, 0.4);
  close(r.worst, 0.03);
  close(r.s, Math.sqrt(0.0002 / 4));
  assert.equal(r.nuEff, 4);
  close(r.k, 2.87, 3e-3);
  close(r.U, r.k * r.s / Math.sqrt(5));
  assert.equal(r.verdict, null);
});

test('calibración: patrón con incertidumbre, grados de libertad efectivos (Welch-Satterthwaite)', () => {
  const readings = [5.02, 5.03, 5.01, 5.02, 5.02];
  const r = calibrationPoint({ readings, ref: 5, lo: 0, hi: 10, uStd: 0.01, kStd: 2 });
  const uA = Math.sqrt(0.0002 / 4) / Math.sqrt(5);
  close(r.uB, 0.005);
  close(r.uc, Math.hypot(uA, 0.005));
  close(r.uA, uA, 1e-12);
  assert.equal(r.nuEff, Math.floor(r.uc ** 4 / (r.uA ** 4 / 4)));
  assert.ok(r.nuEff > 4);
  // Lecturas idénticas: solo cuenta el patrón y k = 2.
  const same = calibrationPoint({ readings: [5, 5, 5], ref: 5, lo: 0, hi: 10, uStd: 0.01 });
  assert.equal(same.nuEff, Infinity);
  close(same.U, 0.01, 1e-3);
  // Una sola lectura: sin tipo A, pero con patrón se puede dar U.
  const one = calibrationPoint({ readings: [5.01], ref: 5, lo: 0, hi: 10, uStd: 0.01 });
  assert.ok(Number.isNaN(one.uA));
  close(one.U, 0.01, 1e-3);
  assert.ok(Number.isNaN(calibrationPoint({ readings: [5.01], ref: 5, lo: 0, hi: 10 }).U));
});

test('calibración: veredicto frente a la tolerancia con la incertidumbre como zona de guarda', () => {
  const base = { ref: 50, lo: 0, hi: 100, uStd: 0.1, tol: 0.5 }; // tolerancia ±0,5 unidades
  assert.equal(calibrationPoint({ ...base, readings: [50.1, 50.1, 50.1] }).verdict, 'pass');
  assert.equal(calibrationPoint({ ...base, readings: [50.45, 50.45, 50.45] }).verdict, 'pass-uncertain');
  assert.equal(calibrationPoint({ ...base, readings: [50.55, 50.55, 50.55] }).verdict, 'fail-uncertain');
  assert.equal(calibrationPoint({ ...base, readings: [49, 49, 49] }).verdict, 'fail');
});

test('calibración: patrón en cero no da % de lectura; rango invertido usa el span en valor absoluto', () => {
  const r = calibrationPoint({ readings: [0.1, 0.1], ref: 0, lo: 100, hi: 0 });
  assert.ok(Number.isNaN(r.errorReading));
  close(r.errorSpan, 0.1);
});

test('términos de la hoja de datos pasados a unidades', () => {
  const ctx = { lo: 0, hi: 2.5, url: 25, reading: 2 };
  close(termAbs({ value: 0.065, base: 'span' }, ctx), 0.001625);
  close(termAbs({ value: 0.1, base: 'url' }, ctx), 0.025);
  close(termAbs({ value: 1, base: 'reading' }, ctx), 0.02);
  close(termAbs({ value: -0.01, base: 'abs' }, ctx), 0.01);
  assert.equal(termAbs({ value: 0, base: 'url' }, { lo: 0, hi: 1 }), 0);
  assert.ok(Number.isNaN(termAbs({ value: 0.1, base: 'url' }, { lo: 0, hi: 1 })));
  assert.throws(() => termAbs({ value: 1, base: 'x' }, ctx));
});

test('error total probable: ejemplo tipo transmisor de presión diferencial', () => {
  // URL 2,5 bar (250 kPa), calibrado 0-50 kPa (turndown 5:1). Valores típicos de hoja:
  // exactitud 0,065 % span; temperatura (0,0125 % URL + 0,0625 % span) por 28 °C, con ΔT 28 °C;
  // presión estática 0,05 % URL por 69 bar con 69 bar.
  const ctx = { lo: 0, hi: 50, url: 250, reading: 50 };
  const comps = [
    { name: 'Exactitud', terms: [{ value: 0.065, base: 'span' }] },
    { name: 'Temperatura', terms: [{ value: 0.0125, base: 'url' }, { value: 0.0625, base: 'span' }], factor: 1 },
    { name: 'Presión estática', terms: [{ value: 0.05, base: 'url' }] },
    { name: 'Vacío', terms: [{ value: 0, base: 'span' }] },
  ];
  const r = totalProbableError(comps, ctx);
  const a = 0.0325;
  const t = 0.03125 + 0.03125;
  const p = 0.125;
  assert.equal(r.parts.length, 3);
  close(r.rss, Math.sqrt(a * a + t * t + p * p));
  close(r.worst, a + t + p);
  close(r.rssSpan, (r.rss / 50) * 100);
  close(r.rssReading, r.rssSpan);
  close(r.turndown, 5);
  assert.deepEqual(r.missing, []);
  // Factor: la mitad del ΔT de referencia reduce ese efecto a la mitad.
  const half = totalProbableError([{ name: 'T', terms: comps[1].terms, factor: 0.5 }], ctx);
  close(half.rss, t / 2);
});

test('error total probable: avisa del dato que falta (URL)', () => {
  const r = totalProbableError([
    { name: 'Exactitud', terms: [{ value: 0.1, base: 'span' }] },
    { name: 'Estabilidad', terms: [{ value: 0.1, base: 'url' }] },
  ], { lo: 0, hi: 10, reading: NaN });
  assert.deepEqual(r.missing, ['Estabilidad']);
  close(r.rss, 0.01);
  assert.ok(Number.isNaN(r.rssReading));
});

test('peor veredicto', () => {
  assert.equal(worstVerdict([]), null);
  assert.equal(worstVerdict([null, 'pass', undefined]), 'pass');
  assert.equal(worstVerdict(['pass', 'fail-uncertain', 'pass-uncertain']), 'fail-uncertain');
  assert.equal(worstVerdict(['fail', 'pass']), 'fail');
});

test('calibración de 5 puntos con subida y bajada: error, histéresis y veredicto', () => {
  // Salida de un transmisor 4-20 mA, una lectura por sentido, tolerancia ±0,25 % (0,04 mA).
  const points = [
    { ref: 4, up: [4.01], down: [4.02] },
    { ref: 8, up: [8.00], down: [8.03] },
    { ref: 12, up: [12.02], down: [12.05] }, // bajada fuera: 0,05 mA = 0,3125 %
    { ref: 16, up: [15.99], down: [16.01] },
    { ref: 20, up: [19.98] }, // en el 100 % solo se sube
  ];
  const r = calibrationRun({ lo: 4, hi: 20, points, tol: 0.25 });
  close(r.span, 16);
  assert.deepEqual(r.points.map((p) => p.pct), [0, 25, 50, 75, 100]);
  close(r.points[1].hysteresis, 0.03);
  close(r.points[1].hysteresisSpan, 0.1875);
  assert.ok(Number.isNaN(r.points[4].hysteresis));
  assert.equal(r.points[4].down, null);
  close(r.points[2].worst, 0.05);
  assert.equal(r.points[2].up.verdict, 'pass');
  assert.equal(r.points[2].down.verdict, 'fail');
  assert.equal(r.points[2].verdict, 'fail');
  assert.equal(r.points[0].verdict, 'pass');
  assert.equal(r.verdict, 'fail');
  close(r.maxError, 0.05);
  close(r.maxErrorSpan, 0.3125);
  close(r.maxHysteresisSpan, 0.1875);
  assert.ok(Number.isNaN(r.maxSSpan)); // una lectura por sentido: sin repetibilidad
});

test('calibración multipunto con varios ciclos: repetibilidad y error negativo como máximo', () => {
  const r = calibrationRun({
    lo: 0, hi: 100,
    points: [
      { ref: 0, up: [0.1, 0.2], down: [0.2, 0.3] },
      { ref: 100, up: [99.5, 99.7], down: [] },
    ],
  });
  close(r.maxError, -0.5);
  close(r.maxErrorSpan, -0.5);
  close(r.maxSSpan, Math.SQRT2 * 0.1);
  close(r.points[0].hysteresis, 0.1);
  assert.equal(r.verdict, null); // sin tolerancia no hay veredicto
});
