// Escalado genérico de señales: cualquier rango de entrada a cualquier rango de salida,
// con presets de señales estándar y raíz cuadrada opcional (caudal por ΔP).
// Módulo puro (sin DOM) para poder testearlo con `node --test`.
import { QUANTITIES, convert, percentToPV, pvToPercent, namurStatus } from './units.js';

/**
 * Magnitudes que solo existen en el escalado de señales (el conversor de unidades
 * no las necesita). Mismo formato que QUANTITIES: factor a la unidad base.
 */
const EXTRA = {
  current: { label: 'Corriente', units: { uA: { label: 'µA', factor: 1e-6 }, mA: { label: 'mA', factor: 1e-3 }, A: { label: 'A', factor: 1 } } },
  voltage: { label: 'Tensión', units: { mV: { label: 'mV', factor: 1e-3 }, V: { label: 'V', factor: 1 } } },
  capacitance: {
    label: 'Capacidad',
    units: { pF: { label: 'pF', factor: 1e-12 }, nF: { label: 'nF', factor: 1e-9 }, uF: { label: 'µF', factor: 1e-6 } },
  },
  resistance: { label: 'Resistencia', units: { ohm: { label: 'Ω', factor: 1 }, kohm: { label: 'kΩ', factor: 1e3 }, Mohm: { label: 'MΩ', factor: 1e6 } } },
  frequency: { label: 'Frecuencia', units: { Hz: { label: 'Hz', factor: 1 }, kHz: { label: 'kHz', factor: 1e3 } } },
  percent: { label: 'Porcentaje', units: { pct: { label: '%', factor: 1 } } },
};

/** Orden de las magnitudes en el selector. `custom` = unidad libre escrita a mano. */
const ORDER = [
  'current', 'voltage', 'pressure', 'temperature', 'volFlow', 'massFlow', 'length',
  'capacitance', 'resistance', 'frequency', 'percent',
];

/** @type {Record<string, {label: string, units: Record<string, {label: string, factor: number}>}>} */
export const SIGNAL_QUANTITIES = Object.fromEntries(
  ORDER.map((k) => [k, EXTRA[k] || QUANTITIES[k]]),
);
export const CUSTOM = 'custom';

/** Convierte dentro de una magnitud de SIGNAL_QUANTITIES. */
export function convertQty(qty, value, from, to) {
  if (from === to) return value;
  if (QUANTITIES[qty]) return convert(qty, value, from, to);
  const q = EXTRA[qty];
  if (!q) throw new Error(`Magnitud desconocida: ${qty}`);
  const f = q.units[from];
  const t = q.units[to];
  if (!f || !t) throw new Error(`Unidad desconocida: ${from} / ${to}`);
  return (value * f.factor) / t.factor;
}

/**
 * Señales estándar de la industria, para elegirlas de una sola vez.
 * @typedef {{id: string, label: string, group: string, qty: string, unit: string, lo: number, hi: number}} Preset
 * @type {Preset[]}
 */
export const PRESETS = [
  { id: '4-20mA', label: '4–20 mA', group: 'Corriente', qty: 'current', unit: 'mA', lo: 4, hi: 20 },
  { id: '0-20mA', label: '0–20 mA', group: 'Corriente', qty: 'current', unit: 'mA', lo: 0, hi: 20 },
  { id: '10-50mA', label: '10–50 mA (antiguo)', group: 'Corriente', qty: 'current', unit: 'mA', lo: 10, hi: 50 },
  { id: '0-10V', label: '0–10 V', group: 'Tensión', qty: 'voltage', unit: 'V', lo: 0, hi: 10 },
  { id: '2-10V', label: '2–10 V', group: 'Tensión', qty: 'voltage', unit: 'V', lo: 2, hi: 10 },
  { id: '1-5V', label: '1–5 V', group: 'Tensión', qty: 'voltage', unit: 'V', lo: 1, hi: 5 },
  { id: '0-5V', label: '0–5 V', group: 'Tensión', qty: 'voltage', unit: 'V', lo: 0, hi: 5 },
  { id: '+-10V', label: '±10 V', group: 'Tensión', qty: 'voltage', unit: 'V', lo: -10, hi: 10 },
  { id: '3-15psi', label: '3–15 psi', group: 'Neumática', qty: 'pressure', unit: 'psi', lo: 3, hi: 15 },
  { id: '0.2-1bar', label: '0,2–1 bar', group: 'Neumática', qty: 'pressure', unit: 'bar', lo: 0.2, hi: 1 },
  { id: '0.2-1kgf', label: '0,2–1 kgf/cm²', group: 'Neumática', qty: 'pressure', unit: 'kgfcm2', lo: 0.2, hi: 1 },
  { id: '20-100kPa', label: '20–100 kPa', group: 'Neumática', qty: 'pressure', unit: 'kPa', lo: 20, hi: 100 },
  { id: '0-100pct', label: '0–100 %', group: 'Otras', qty: 'percent', unit: 'pct', lo: 0, hi: 100 },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);

const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Id del preset que coincide exactamente con el rango dado, o null. */
export function matchPreset(qty, unit, lo, hi) {
  const p = PRESETS.find((x) => x.qty === qty && x.unit === unit && same(x.lo, lo) && same(x.hi, hi));
  return p ? p.id : null;
}

/** Cambia la unidad de un rango conservando su significado físico (0–10 bar -> 0–145 psi). */
export function convertRange(qty, range, from, to) {
  return { lo: convertQty(qty, range.lo, from, to), hi: convertQty(qty, range.hi, from, to) };
}

/**
 * Escala un valor de la entrada A a la salida B.
 * Con `sqrt`, la salida es la raíz cuadrada de la señal de entrada
 * (transmisor de ΔP lineal -> caudal): out = outLo + (outHi-outLo)·√frac.
 * @returns {{pct: number, out: number}}
 */
export function scale(inValue, inRange, outRange, sqrt = false) {
  const pct = pvToPercent(inValue, inRange.lo, inRange.hi);
  return { pct, out: percentToPV(pct, outRange.lo, outRange.hi, sqrt) };
}

/** Inversa de `scale`: de la salida B a la entrada A. */
export function unscale(outValue, inRange, outRange, sqrt = false) {
  const pct = pvToPercent(outValue, outRange.lo, outRange.hi, sqrt);
  return { pct, in: percentToPV(pct, inRange.lo, inRange.hi) };
}

/** Valor de un rango para un % de señal (lineal). */
export const valueAtPercent = (pct, range) => percentToPV(pct, range.lo, range.hi);

/** % de señal para un valor de un rango (lineal). */
export const percentOfValue = (value, range) => pvToPercent(value, range.lo, range.hi);

/** ¿Es el rango 4–20 mA? (único al que aplica NAMUR NE 43). */
export function isLoopRange(qty, unit, lo, hi) {
  if (qty !== 'current') return false;
  return same(convertQty(qty, lo, unit, 'mA'), 4) && same(convertQty(qty, hi, unit, 'mA'), 20);
}

/**
 * Diagnóstico de un valor de entrada. Con rango 4–20 mA usa NAMUR NE 43;
 * con cualquier otro, solo indica si está dentro del 0–100 %.
 * @returns {{status: string}}
 */
export function signalStatus(pct, { qty, unit, lo, hi, value }) {
  if (isLoopRange(qty, unit, lo, hi)) return { status: namurStatus(convertQty(qty, value, unit, 'mA')) };
  if (pct < 0) return { status: 'bajo-rango' };
  if (pct > 100) return { status: 'sobre-rango' };
  return { status: 'ok' };
}
