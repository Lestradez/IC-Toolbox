// Planilla de calibración: instrumento, patrón, puntos de subida y bajada, as found y
// as left. Funciones puras (sin DOM): la vista guarda lo que escribe el usuario (textos)
// y aquí se convierte en números, se evalúa con calibrationRun (js/calibration.js) y se
// arma el informe que usan la exportación a Excel y la impresión a PDF.
import { calibrationRun, worstVerdict } from './calibration.js';
import { SIGNAL_QUANTITIES, PRESETS, presetById, scale } from './signal.js';
import { parseNum, fmt } from './ui.js';

export const MIN_POINTS = 2;
export const MAX_POINTS = 11;
/** Relación tolerancia / incertidumbre mínima habitual (TUR 4:1). */
export const MIN_TUR = 4;

export const TYPES = {
  transmitter: 'Transmisor',
  indicator: 'Indicador (manómetro…)',
};

export const SERIES = { asFound: 'As found (como se encontró)', asLeft: 'As left (como se dejó)' };

export const VERDICT_TEXT = {
  pass: 'Cumple',
  'pass-uncertain': 'Cumple (zona de duda)',
  'fail-uncertain': 'No cumple (zona de duda)',
  fail: 'No cumple',
};
export const VERDICT_LEVEL = { pass: 'ok', 'pass-uncertain': 'warn', 'fail-uncertain': 'warn', fail: 'bad' };

/** Porcentajes de los puntos, repartidos por igual: 3 -> 0/50/100, 5 -> 0/25/50/75/100. */
export function pointPercents(n) {
  const k = Math.round(n);
  if (!(k >= MIN_POINTS && k <= MAX_POINTS)) throw new RangeError(`Entre ${MIN_POINTS} y ${MAX_POINTS} puntos`);
  return Array.from({ length: k }, (_, i) => Math.round((i / (k - 1)) * 100 * 1e6) / 1e6);
}

/** Valor de un rango para un % (lineal). */
export const valueAt = (pct, lo, hi) => lo + (pct / 100) * (hi - lo);

/** Salida esperada (lineal) para un valor aplicado en la entrada. */
export const expectedOutput = (applied, inRange, outRange) => scale(applied, inRange, outRange).out;

/** Planilla vacía con valores por defecto (todo texto, como en los campos). */
export function emptyDoc(id = newId()) {
  return {
    v: 1,
    id,
    tag: '', desc: '', maker: '', model: '', serial: '', location: '',
    date: '', tech: '', order: '', procedure: '', notes: '',
    std: { desc: '', maker: '', serial: '', cert: '', due: '', U: '', outU: '' },
    type: 'transmitter',
    unit: 'pressure:bar', customUnit: '',
    lo: '0', hi: '10',
    out: '4-20mA', outUnit: 'mA', outLo: '4', outHi: '20',
    tol: '0,5', hystTol: '',
    n: 5,
    asFound: emptySeries(5),
    asLeft: emptySeries(5),
  };
}

export const emptySeries = (n) => ({ applied: Array(n).fill(''), up: Array(n).fill(''), down: Array(n).fill('') });

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** ¿Tiene la serie algún dato escrito? */
export const seriesHasData = (s) => ['applied', 'up', 'down'].some((k) => (s?.[k] || []).some((x) => String(x).trim() !== ''));

/**
 * Completa una planilla guardada (de una versión anterior o tocada a mano) con los campos
 * que falten, para que la vista nunca encuentre `undefined`.
 */
export function normalizeDoc(raw) {
  const base = emptyDoc(raw && typeof raw.id === 'string' ? raw.id : undefined);
  if (!raw || typeof raw !== 'object') return base;
  const doc = { ...base };
  for (const k of Object.keys(base)) {
    if (k === 'std' || k === 'asFound' || k === 'asLeft') continue;
    if (typeof raw[k] === typeof base[k]) doc[k] = raw[k];
  }
  doc.std = { ...base.std };
  for (const k of Object.keys(base.std)) if (typeof raw.std?.[k] === 'string') doc.std[k] = raw.std[k];
  doc.n = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(Number(raw.n) || base.n)));
  if (!TYPES[doc.type]) doc.type = base.type;
  for (const s of ['asFound', 'asLeft']) {
    const src = raw[s] || {};
    doc[s] = Object.fromEntries(['applied', 'up', 'down'].map((k) => [k,
      Array.from({ length: doc.n }, (_, i) => (typeof src[k]?.[i] === 'string' ? src[k][i] : ''))]));
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

/** Etiqueta de una unidad «magnitud:unidad» (o la escrita a mano). */
export function unitLabel(doc) {
  if (doc.unit === 'custom') return doc.customUnit.trim();
  const [q, u] = doc.unit.split(':');
  return SIGNAL_QUANTITIES[q]?.units[u]?.label ?? u ?? '';
}

/** Rango de salida del transmisor: preset o personalizado. */
export function outputRange(doc) {
  const p = presetById(doc.out);
  if (p) return { lo: p.lo, hi: p.hi, unit: SIGNAL_QUANTITIES[p.qty].units[p.unit].label };
  return { lo: parseNum(doc.outLo), hi: parseNum(doc.outHi), unit: doc.outUnit.trim() };
}

/** Salidas que se ofrecen en el selector (las señales estándar, menos el 0–100 %). */
export const OUTPUT_PRESETS = PRESETS.filter((p) => p.qty !== 'percent');

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------

/** Texto opcional -> número (vacío = fallback). NaN si hay texto que no es número. */
const optNum = (s, fallback = NaN) => (String(s ?? '').trim() === '' ? fallback : parseNum(s));

/**
 * Evalúa una serie (as found o as left).
 *
 * @param {object} o
 * @param {{lo: number, hi: number}} o.inRange   rango del instrumento (unidad del patrón)
 * @param {{lo: number, hi: number}} o.outRange  rango en que lee: salida del transmisor, o el
 *   mismo inRange si es un indicador
 * @param {number[]} o.percents
 * @param {{applied: number[], up: number[], down: number[]}} o.series  NaN = sin dato; applied NaN = nominal
 * @param {number} o.tol       tolerancia en ± % span
 * @param {number} [o.hystTol] tolerancia de histéresis en % span (0 o NaN = no se evalúa)
 * @param {number} [o.U]       incertidumbre expandida (k = 2) total en unidades de outRange
 */
export function evaluateSeries({ inRange, outRange, percents, series, tol, hystTol = NaN, U = 0 }) {
  const lo = outRange.lo;
  const hi = outRange.hi;
  const span = Math.abs(hi - lo);
  const pts = percents.map((pct, i) => {
    const nominal = valueAt(pct, inRange.lo, inRange.hi);
    const applied = Number.isFinite(series.applied[i]) ? series.applied[i] : nominal;
    return { pct, nominal, applied, expected: expectedOutput(applied, inRange, outRange) };
  });
  const run = calibrationRun({
    lo, hi, tol, uStd: U > 0 ? U : 0, kStd: 2,
    points: pts.map((p, i) => ({
      ref: p.expected,
      up: Number.isFinite(series.up[i]) ? [series.up[i]] : [],
      down: Number.isFinite(series.down[i]) ? [series.down[i]] : [],
    })),
  });
  const points = pts.map((p, i) => {
    const r = run.points[i];
    const hystFail = hystTol > 0 && Number.isFinite(r.hysteresisSpan) && r.hysteresisSpan > hystTol + 1e-12;
    return {
      ...p,
      up: series.up[i],
      down: series.down[i],
      errUp: r.up ? r.up.error : NaN,
      errDown: r.down ? r.down.error : NaN,
      errUpSpan: r.up ? r.up.errorSpan : NaN,
      errDownSpan: r.down ? r.down.errorSpan : NaN,
      hysteresisSpan: r.hysteresisSpan,
      hystFail,
      verdict: hystFail ? 'fail' : r.verdict,
      filled: !!(r.up || r.down),
    };
  });
  const filled = points.filter((p) => p.filled).length;
  const errs = points.flatMap((p) => [p.errUpSpan, p.errDownSpan]).filter(Number.isFinite);
  const maxErrorSpan = errs.reduce((m, v) => (Number.isNaN(m) || Math.abs(v) > Math.abs(m) ? v : m), NaN);
  const tolAbs = tol > 0 ? (tol / 100) * span : NaN;
  return {
    points,
    filled,
    complete: points.every((p) => Number.isFinite(p.up) && Number.isFinite(p.down)),
    maxErrorSpan,
    maxHysteresisSpan: run.maxHysteresisSpan,
    verdict: filled ? worstVerdict(points.map((p) => p.verdict)) : null,
    U: U > 0 ? U : NaN,
    USpan: U > 0 && span > 0 ? (U / span) * 100 : NaN,
    tur: U > 0 && tolAbs > 0 ? tolAbs / U : NaN,
  };
}

/**
 * Lee y evalúa una planilla completa. Devuelve { ok: false, error } si el rango o los
 * criterios no son válidos; si no, { ok: true, inRange, outRange, percents, U, found, left,
 * warnings: [[nivel, texto]] }.
 */
export function evaluateDoc(doc, today = '') {
  const lo = parseNum(doc.lo);
  const hi = parseNum(doc.hi);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return { ok: false, error: 'Rango del instrumento: LRV y URV válidos y distintos.' };
  const inRange = { lo, hi, unit: unitLabel(doc) };
  let outRange = inRange;
  if (doc.type === 'transmitter') {
    outRange = outputRange(doc);
    if (!Number.isFinite(outRange.lo) || !Number.isFinite(outRange.hi) || outRange.lo === outRange.hi) {
      return { ok: false, error: 'Salida del transmisor: valores válidos y distintos.' };
    }
  }
  const tol = optNum(doc.tol, 0);
  const hystTol = optNum(doc.hystTol, 0);
  const uStd = optNum(doc.std.U, 0);
  const uOut = doc.type === 'transmitter' ? optNum(doc.std.outU, 0) : 0;
  if (!(tol > 0)) return { ok: false, error: 'Tolerancia: un valor mayor que 0 (± % span).' };
  if (!(hystTol >= 0)) return { ok: false, error: 'Tolerancia de histéresis no válida.' };
  if (!(uStd >= 0) || !(uOut >= 0)) return { ok: false, error: 'Incertidumbre del patrón no válida (≥ 0 o vacía).' };

  // U del patrón (unidad de entrada) llevada a la unidad en que se lee, y combinada (RSS)
  // con la de la medición de la salida.
  const gain = Math.abs((outRange.hi - outRange.lo) / (hi - lo));
  const U = Math.hypot(uStd * gain, uOut);
  const percents = pointPercents(doc.n);

  const toNums = (s) => ({
    applied: s.applied.map((x) => optNum(x)),
    up: s.up.map((x) => optNum(x)),
    down: s.down.map((x) => optNum(x)),
  });
  const warnings = [];
  const bad = [];
  for (const [key, label] of [['asFound', 'As found'], ['asLeft', 'As left']]) {
    for (const f of ['applied', 'up', 'down']) {
      doc[key][f].forEach((x, i) => { if (String(x).trim() !== '' && Number.isNaN(parseNum(x))) bad.push(`${label} punto ${i + 1}`); });
    }
  }
  if (bad.length) warnings.push(['bad', `No es un número (se ignora): ${[...new Set(bad)].join(', ')}.`]);

  const common = { inRange, outRange, percents, tol, hystTol, U };
  const found = evaluateSeries({ ...common, series: toNums(doc.asFound) });
  const left = evaluateSeries({ ...common, series: toNums(doc.asLeft) });

  const date = doc.date || today;
  if (doc.std.due && date && doc.std.due < date) {
    warnings.push(['bad', `Patrón vencido: su calibración venció el ${fmtDate(doc.std.due)}, antes de la fecha de esta calibración.`]);
  }
  if (U > 0 && found.tur < MIN_TUR) {
    warnings.push(['warn', `Relación tolerancia/incertidumbre (TUR) ${fmt(found.tur, 2)}:1, menor que ${MIN_TUR}:1: el patrón es justo para esta tolerancia y habrá más resultados en zona de duda.`]);
  }
  return { ok: true, ...common, uStd, uOut, found, left, warnings };
}

/** 2026-11-10 -> 10/11/2026 (las fechas se guardan como las da <input type="date">). */
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}

/** Nombre de archivo sin caracteres problemáticos: «calibracion_PT-101_2026-11-10». */
export function fileBase(doc) {
  const clean = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return ['calibracion', clean(doc.tag) || 'sin-tag', doc.date || ''].filter(Boolean).join('_');
}

// ---------------------------------------------------------------------------
// Informe (lo comparten Excel y la impresión)
// ---------------------------------------------------------------------------

/** Veredicto final de la planilla: el as left si tiene datos; si no, el as found. */
export function finalVerdict(ev) {
  if (!ev.ok) return null;
  return ev.left.filled ? ev.left.verdict : ev.found.verdict;
}

/**
 * Informe en bloques neutros (sin formato): la vista lo pinta para imprimir y
 * reportSheet lo pasa a filas de Excel.
 * Devuelve { title, blocks: [{ title, pairs: [[clave, valor]] }], series: [...], notes, verdict }.
 */
export function buildReport(doc, ev) {
  const u = ev.inRange.unit;
  const ou = ev.outRange.unit;
  const range = (r, unit) => `${fmt(r.lo)} a ${fmt(r.hi)}${unit ? ` ${unit}` : ''}`;
  const instrument = [
    ['TAG', doc.tag], ['Descripción / servicio', doc.desc], ['Fabricante', doc.maker], ['Modelo', doc.model],
    ['Nº de serie', doc.serial], ['Ubicación', doc.location], ['Tipo', TYPES[doc.type]],
    ['Rango', range(ev.inRange, u)],
  ];
  if (doc.type === 'transmitter') instrument.push(['Salida', range(ev.outRange, ou)]);
  const std = [
    ['Patrón', doc.std.desc], ['Marca y modelo', doc.std.maker], ['Nº de serie', doc.std.serial],
    ['Nº de certificado', doc.std.cert], ['Vencimiento de la calibración', fmtDate(doc.std.due)],
    ['Incertidumbre U (k = 2)', ev.uStd > 0 ? `±${fmt(ev.uStd, 4)} ${u}`.trim() : 'No declarada'],
  ];
  if (doc.type === 'transmitter' && ev.uOut > 0) std.push(['U de la medición de salida (k = 2)', `±${fmt(ev.uOut, 4)} ${ou}`.trim()]);
  const work = [
    ['Fecha', fmtDate(doc.date)], ['Técnico', doc.tech], ['Orden de trabajo', doc.order], ['Procedimiento', doc.procedure],
  ];
  const criteria = [
    ['Tolerancia', `±${fmt(ev.tol)} % span (±${fmt((ev.tol / 100) * Math.abs(ev.outRange.hi - ev.outRange.lo), 4)} ${ou})`.replace(' )', ')')],
    ['Tolerancia de histéresis', ev.hystTol > 0 ? `${fmt(ev.hystTol)} % span` : 'No se evalúa'],
    ['Regla de decisión', ev.U > 0
      ? `ILAC-G8: cumple si |error| + U ≤ tolerancia; no cumple si |error| − U > tolerancia; en medio, zona de duda. U total = ±${fmt(ev.U, 4)} ${ou} (${fmt(ev.found.USpan, 3)} % span), TUR ${fmt(ev.found.tur, 2)}:1.`
      : 'Aceptación simple: cumple si |error| ≤ tolerancia (sin incertidumbre del patrón declarada).'],
  ];
  const series = [['asFound', ev.found], ['asLeft', ev.left]].map(([key, s]) => ({
    key,
    title: SERIES[key],
    unitIn: u,
    unitOut: ou,
    points: s.points,
    raw: doc[key], // lecturas tal como se escribieron (conservan los ceros: 12,10)
    filled: s.filled,
    verdict: s.verdict,
    maxErrorSpan: s.maxErrorSpan,
    maxHysteresisSpan: s.maxHysteresisSpan,
  }));
  return {
    title: 'Planilla de calibración',
    subtitle: [doc.tag, doc.desc].filter(Boolean).join(' · '),
    blocks: [
      { title: 'Instrumento', pairs: instrument },
      { title: 'Patrón', pairs: std },
      { title: 'Calibración', pairs: work },
      { title: 'Criterio de aceptación', pairs: criteria },
    ],
    series,
    notes: doc.notes,
    verdict: finalVerdict(ev),
    warnings: ev.warnings,
  };
}

/** Columnas de la tabla de puntos (mismo orden en Excel e impresión). */
export function seriesColumns(s) {
  const iu = s.unitIn ? ` (${s.unitIn})` : '';
  const ou = s.unitOut ? ` (${s.unitOut})` : '';
  return ['%', `Patrón${iu}`, `Esperado${ou}`, `Subida${ou}`, `Bajada${ou}`, 'Error ↑ (% span)', 'Error ↓ (% span)', 'Histéresis (% span)', 'Resultado'];
}

/** Hoja de Excel (para js/xlsx.js) con el informe. Los números van como números. */
export function reportSheet(report) {
  const rows = [];
  const add = (...cells) => rows.push(cells);
  const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
  const r6 = (x) => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null);
  add({ v: report.title, s: 'title' });
  if (report.subtitle) add({ v: report.subtitle, s: 'bold' });
  add();
  for (const b of report.blocks) {
    add({ v: b.title, s: 'head' });
    for (const [k, v] of b.pairs) add({ v: k, s: 'cell' }, v ?? '');
    add();
  }
  for (const s of report.series) {
    add({ v: s.title, s: 'bold' });
    add(...seriesColumns(s).map((c) => ({ v: c, s: 'head' })));
    if (!s.filled) {
      add({ v: 'Sin datos', s: 'cell' });
    } else {
      for (const p of s.points) {
        add(
          { v: p.pct, s: 'cell' },
          { v: r6(p.applied), s: 'cell' },
          { v: r4(p.expected), s: 'cell' },
          { v: Number.isFinite(p.up) ? p.up : null, s: 'cell' },
          { v: Number.isFinite(p.down) ? p.down : null, s: 'cell' },
          { v: r4(p.errUpSpan), s: 'num3' },
          { v: r4(p.errDownSpan), s: 'num3' },
          { v: r4(p.hysteresisSpan), s: 'num3' },
          { v: p.verdict ? VERDICT_TEXT[p.verdict] : '', s: p.verdict ? VERDICT_LEVEL[p.verdict] : 'cell' },
        );
      }
      add({ v: 'Error máximo (% span)', s: 'bold' }, null, null, null, null, { v: r4(s.maxErrorSpan), s: 'num3' });
      add({ v: 'Histéresis máxima (% span)', s: 'bold' }, null, null, null, null, null, null, { v: r4(s.maxHysteresisSpan), s: 'num3' });
      add({ v: 'Resultado', s: 'bold' }, { v: s.verdict ? VERDICT_TEXT[s.verdict] : '—', s: s.verdict ? VERDICT_LEVEL[s.verdict] : 'cell' });
    }
    add();
  }
  if (report.warnings.length) {
    add({ v: 'Avisos', s: 'bold' });
    for (const [, t] of report.warnings) add(t);
    add();
  }
  if (report.notes?.trim()) {
    add({ v: 'Observaciones', s: 'bold' });
    for (const line of report.notes.split('\n')) add(line);
    add();
  }
  add({ v: 'Resultado final', s: 'bold' }, { v: report.verdict ? VERDICT_TEXT[report.verdict] : 'Sin datos', s: report.verdict ? VERDICT_LEVEL[report.verdict] : 'cell' });
  add();
  add('Realizó (firma y aclaración):', null, null, null, 'Revisó (firma y aclaración):');
  return { name: 'Calibración', rows, widths: [28, 14, 14, 14, 14, 14, 14, 16, 22] };
}
