// Estadística de calibración y error total probable. Funciones puras, sin DOM.
//
// - Lecturas repetidas frente a un patrón: media, desviación típica, incertidumbre tipo A,
//   incertidumbre expandida (GUM, t de Student con grados de libertad efectivos) y error
//   en % del span y % de la lectura, con veredicto frente a una tolerancia.
// - Error total probable (TPE) de un transmisor a partir de su hoja de datos: cada efecto
//   se pasa a unidades y se combinan por RSS (raíz de la suma de cuadrados).

/** Nivel de confianza de la incertidumbre expandida (k ≈ 2 con muchos grados de libertad). */
export const CONFIDENCE = 0.9545;

// ---------------------------------------------------------------------------
// Lectura de listas
// ---------------------------------------------------------------------------

/**
 * Convierte un texto con lecturas en números. Separadores: espacios, saltos de línea y «;».
 * La coma es decimal («4,01»), así que no separa; una coma final («4.01,») se ignora.
 * Devuelve { values, invalid } con los trozos que no son números.
 */
export function parseReadings(text) {
  const values = [];
  const invalid = [];
  for (const raw of String(text).split(/[\s;]+/)) {
    const tok = raw.replace(/,$/, '');
    if (!tok) continue;
    const n = Number(tok.replace('−', '-').replace(',', '.'));
    if (tok.split(',').length > 2 || !Number.isFinite(n)) invalid.push(raw);
    else values.push(n);
  }
  return { values, invalid };
}

// ---------------------------------------------------------------------------
// Estadística básica
// ---------------------------------------------------------------------------

/**
 * Estadística de una muestra. `s` es la desviación típica muestral (n − 1), la que usa la
 * GUM para la incertidumbre tipo A; `sigmaPop` la poblacional (n), por si se compara con
 * una calculadora. Con n < 2 las dispersiones son NaN.
 */
export function stats(values) {
  const n = values.length;
  if (!n) return { n: 0, mean: NaN, s: NaN, sigmaPop: NaN, uA: NaN, min: NaN, max: NaN, range: NaN };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const ss = values.reduce((a, x) => a + (x - mean) ** 2, 0);
  const s = n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { n, mean, s, sigmaPop: Math.sqrt(ss / n), uA: s / Math.sqrt(n), min, max, range: max - min };
}

// ---------------------------------------------------------------------------
// t de Student
// ---------------------------------------------------------------------------

function logGamma(x) {
  // Lanczos (g = 7, n = 9): error relativo < 1e-13 para x > 0.
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fracción continua de la beta incompleta (Numerical Recipes, betacf). */
function betaCF(a, b, x) {
  const TINY = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betaCF(a, b, x)) / a : 1 - (bt * betaCF(b, a, 1 - x)) / b;
}

/** P(|T| ≤ t) para una t de Student con ν grados de libertad (ν puede ser fraccionario). */
export function tTwoSided(t, nu) {
  if (t <= 0) return 0;
  return 1 - betaInc(nu / 2, 0.5, nu / (nu + t * t));
}

/** P(|Z| ≤ z) para la normal estándar: erf(z/√2) por serie de Taylor. */
function normalTwoSided(z) {
  const x = z / Math.SQRT2;
  if (x > 6) return 1;
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (-x * x) / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

/**
 * Factor de cobertura k = t_p(ν): el valor de t tal que P(|T| ≤ k) = p (bilateral).
 * ν = Infinity (o muy grande) usa la normal. ν < 1 devuelve NaN.
 */
export function coverageFactor(nu, p = CONFIDENCE) {
  if (!(nu >= 1) || !(p > 0 && p < 1)) return NaN;
  const cdf = nu > 1e7 ? normalTwoSided : (t) => tTwoSided(t, nu);
  let lo = 0;
  let hi = 1;
  while (cdf(hi) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Calibración de un punto con lecturas repetidas
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {number[]} o.readings  lecturas del instrumento (mismas unidades que ref)
 * @param {number} o.ref         valor del patrón
 * @param {number} o.lo          LRV (0 % del span)
 * @param {number} o.hi          URV (100 % del span)
 * @param {number} [o.uStd]      incertidumbre expandida del patrón, en unidades
 * @param {number} [o.kStd=2]    factor de cobertura con que se da uStd
 * @param {number} [o.tol]       tolerancia (error máximo permitido), en % del span
 */
export function calibrationPoint({ readings, ref, lo, hi, uStd = 0, kStd = 2, tol }) {
  const st = stats(readings);
  const span = Math.abs(hi - lo);
  const pctSpan = (x) => (span > 0 ? (x / span) * 100 : NaN);
  const pctReading = (x) => (ref !== 0 ? (x / Math.abs(ref)) * 100 : NaN);

  const error = st.mean - ref;
  // Peor lectura individual (lo que vería quien mira una sola lectura).
  const worst = readings.reduce((w, x) => (Math.abs(x - ref) > Math.abs(w) ? x - ref : w), 0);

  // Incertidumbre combinada: tipo A (repetibilidad) + tipo B del patrón (ν = ∞).
  const uA = st.n > 1 ? st.uA : NaN;
  const uB = uStd > 0 && kStd > 0 ? uStd / kStd : 0;
  const uc = Number.isNaN(uA) ? (uB > 0 ? uB : NaN) : Math.hypot(uA, uB);
  // Welch-Satterthwaite: solo la tipo A tiene grados de libertad finitos. GUM G.4.1: se trunca.
  let nuEff;
  if (Number.isNaN(uA)) nuEff = uB > 0 ? Infinity : NaN;
  else if (uA === 0) nuEff = Infinity;
  else nuEff = Math.floor((uc ** 4) / ((uA ** 4) / (st.n - 1)));
  if (nuEff > 1e7) nuEff = Infinity;
  const k = coverageFactor(nuEff);
  const U = k * uc;

  let verdict = null;
  if (tol > 0 && span > 0 && Number.isFinite(error)) {
    const lim = (tol / 100) * span;
    const Uv = Number.isFinite(U) ? U : 0;
    if (Math.abs(error) + Uv <= lim) verdict = 'pass';
    else if (Math.abs(error) - Uv > lim) verdict = 'fail';
    else verdict = Math.abs(error) <= lim ? 'pass-uncertain' : 'fail-uncertain';
  }

  return {
    ...st,
    span,
    error,
    errorSpan: pctSpan(error),
    errorReading: pctReading(error),
    worst,
    worstSpan: pctSpan(worst),
    sSpan: pctSpan(st.s),
    uA, uB, uc, nuEff, k, U,
    USpan: pctSpan(U),
    tolAbs: tol > 0 ? (tol / 100) * span : NaN,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Error total probable (hoja de datos del transmisor)
// ---------------------------------------------------------------------------

/** Bases en que las hojas de datos dan cada efecto. */
export const BASES = {
  span: '% del span',
  url: '% del URL',
  reading: '% de la lectura',
  abs: 'unidades',
};

/**
 * Valor absoluto (en unidades del proceso) de un término `{ value, base }`.
 * ctx = { lo, hi, url, reading }. NaN si falta el dato de esa base.
 */
export function termAbs({ value, base }, { lo, hi, url, reading }) {
  if (!value) return 0;
  switch (base) {
    case 'span': return (Math.abs(value) / 100) * Math.abs(hi - lo);
    case 'url': return url > 0 ? (Math.abs(value) / 100) * url : NaN;
    case 'reading': return Number.isFinite(reading) ? (Math.abs(value) / 100) * Math.abs(reading) : NaN;
    case 'abs': return Math.abs(value);
    default: throw new Error(`Base desconocida: ${base}`);
  }
}

/**
 * Error total probable. Cada componente = factor × suma de sus términos (los términos de
 * un mismo efecto se suman linealmente, como «±(0,0125 % URL + 0,0625 % span) por 28 °C»);
 * los componentes se combinan por RSS. También se da el peor caso (suma lineal).
 *
 * components = [{ name, terms: [{ value, base }], factor = 1 }]
 * ctx = { lo, hi, url, reading }
 * Devuelve { parts: [{ name, abs, span }], rss, worst, rssSpan, worstSpan, rssReading,
 *   worstReading, missing: [nombres sin dato] }.
 */
export function totalProbableError(components, ctx) {
  const span = Math.abs(ctx.hi - ctx.lo);
  const pctSpan = (x) => (span > 0 ? (x / span) * 100 : NaN);
  const pctReading = (x) => (Number.isFinite(ctx.reading) && ctx.reading !== 0 ? (x / Math.abs(ctx.reading)) * 100 : NaN);
  const parts = [];
  const missing = [];
  for (const c of components) {
    const factor = c.factor ?? 1;
    const sum = c.terms.reduce((a, t) => a + termAbs(t, ctx), 0);
    const abs = Math.abs(factor) * sum;
    if (Number.isNaN(abs)) { missing.push(c.name); continue; }
    if (abs === 0) continue;
    parts.push({ name: c.name, abs, span: pctSpan(abs) });
  }
  const rss = Math.sqrt(parts.reduce((a, p) => a + p.abs ** 2, 0));
  const worst = parts.reduce((a, p) => a + p.abs, 0);
  return {
    parts,
    missing,
    rss,
    worst,
    rssSpan: pctSpan(rss),
    worstSpan: pctSpan(worst),
    rssReading: pctReading(rss),
    worstReading: pctReading(worst),
    turndown: ctx.url > 0 && span > 0 ? ctx.url / span : NaN,
  };
}
