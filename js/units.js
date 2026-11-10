// Conversiones de unidades para instrumentación y control.
// Módulo puro (sin DOM) para poder testearlo con `node --test`.
//
// Cada magnitud define sus unidades como factor a la unidad base del SI.
// La temperatura es afín (con offset) y se trata aparte.

// Gravedad estándar (CGPM 1901), usada en kgf y columnas de agua convencionales.
const G0 = 9.80665;

/** @type {Record<string, {label: string, base: string, units: Record<string, {label: string, factor: number}>, note?: string}>} */
export const QUANTITIES = {
  pressure: {
    label: 'Presión',
    base: 'Pa',
    note:
      'Las unidades de columna de agua usan la definición convencional (agua a 4 °C, ' +
      'g = 9,80665 m/s²). Algunos fabricantes calibran inH₂O a 60 °F o 68 °F: ' +
      'la diferencia es ~0,1–0,2 %. La conversión no distingue manométrica de absoluta.',
    units: {
      Pa: { label: 'Pa', factor: 1 },
      kPa: { label: 'kPa', factor: 1e3 },
      MPa: { label: 'MPa', factor: 1e6 },
      bar: { label: 'bar', factor: 1e5 },
      mbar: { label: 'mbar', factor: 100 },
      psi: { label: 'psi', factor: 6894.757293168361 },
      kgfcm2: { label: 'kgf/cm²', factor: G0 * 1e4 },
      atm: { label: 'atm', factor: 101325 },
      torr: { label: 'Torr', factor: 101325 / 760 },
      mmHg: { label: 'mmHg (0 °C)', factor: 133.322387415 },
      inHg: { label: 'inHg (0 °C)', factor: 133.322387415 * 25.4 },
      mmH2O: { label: 'mmH₂O (4 °C)', factor: G0 },
      mH2O: { label: 'mH₂O (4 °C)', factor: G0 * 1e3 },
      inH2O: { label: 'inH₂O (4 °C)', factor: G0 * 25.4 },
      ftH2O: { label: 'ftH₂O (4 °C)', factor: G0 * 304.8 },
    },
  },
  volFlow: {
    label: 'Caudal volumétrico',
    base: 'm3/s',
    units: {
      'm3/s': { label: 'm³/s', factor: 1 },
      'm3/h': { label: 'm³/h', factor: 1 / 3600 },
      'L/s': { label: 'L/s', factor: 1e-3 },
      'L/min': { label: 'L/min', factor: 1e-3 / 60 },
      'L/h': { label: 'L/h', factor: 1e-3 / 3600 },
      USgpm: { label: 'US gpm', factor: 3.785411784e-3 / 60 },
      IMPgpm: { label: 'Imp gpm', factor: 4.54609e-3 / 60 },
      cfm: { label: 'ft³/min (cfm)', factor: 0.028316846592 / 60 },
      cfh: { label: 'ft³/h', factor: 0.028316846592 / 3600 },
      'bbl/d': { label: 'bbl/d (petróleo)', factor: 0.158987294928 / 86400 },
    },
  },
  massFlow: {
    label: 'Caudal másico',
    base: 'kg/s',
    units: {
      'kg/s': { label: 'kg/s', factor: 1 },
      'kg/h': { label: 'kg/h', factor: 1 / 3600 },
      't/h': { label: 't/h', factor: 1000 / 3600 },
      'lb/h': { label: 'lb/h', factor: 0.45359237 / 3600 },
      'lb/s': { label: 'lb/s', factor: 0.45359237 },
    },
  },
  length: {
    label: 'Nivel / longitud',
    base: 'm',
    units: {
      mm: { label: 'mm', factor: 1e-3 },
      cm: { label: 'cm', factor: 1e-2 },
      m: { label: 'm', factor: 1 },
      in: { label: 'in', factor: 0.0254 },
      ft: { label: 'ft', factor: 0.3048 },
    },
  },
  temperature: {
    label: 'Temperatura',
    base: 'K',
    note: 'Conversión de valores absolutos. Para diferencias (ΔT) 1 °C = 1 K = 1,8 °F.',
    units: {
      C: { label: '°C', factor: NaN },
      F: { label: '°F', factor: NaN },
      K: { label: 'K', factor: NaN },
      R: { label: '°R', factor: NaN },
    },
  },
};

function tempToK(v, u) {
  switch (u) {
    case 'C': return v + 273.15;
    case 'F': return (v - 32) * 5 / 9 + 273.15;
    case 'K': return v;
    case 'R': return v * 5 / 9;
    default: throw new Error(`Unidad de temperatura desconocida: ${u}`);
  }
}

function kToTemp(k, u) {
  switch (u) {
    case 'C': return k - 273.15;
    case 'F': return (k - 273.15) * 9 / 5 + 32;
    case 'K': return k;
    case 'R': return k * 9 / 5;
    default: throw new Error(`Unidad de temperatura desconocida: ${u}`);
  }
}

/**
 * Convierte `value` de la unidad `from` a la unidad `to` dentro de la magnitud `quantity`.
 * @returns {number}
 */
export function convert(quantity, value, from, to) {
  const q = QUANTITIES[quantity];
  if (!q) throw new Error(`Magnitud desconocida: ${quantity}`);
  if (quantity === 'temperature') {
    const k = tempToK(value, from);
    if (k < 0) throw new RangeError('Temperatura por debajo del cero absoluto');
    return kToTemp(k, to);
  }
  const f = q.units[from];
  const t = q.units[to];
  if (!f) throw new Error(`Unidad desconocida: ${from}`);
  if (!t) throw new Error(`Unidad desconocida: ${to}`);
  return (value * f.factor) / t.factor;
}

/** Convierte un valor a todas las unidades de su magnitud. */
export function convertAll(quantity, value, from) {
  const q = QUANTITIES[quantity];
  return Object.keys(q.units).map((u) => ({ unit: u, label: q.units[u].label, value: convert(quantity, value, from, u) }));
}

// ---------------------------------------------------------------------------
// Señal analógica 4-20 mA
// ---------------------------------------------------------------------------

export const SIGNAL_MIN_MA = 4;
export const SIGNAL_MAX_MA = 20;
// Límites NAMUR NE 43: saturación 3,8–20,5 mA; fallo ≤ 3,6 mA o ≥ 21 mA.
export const NAMUR = { failLow: 3.6, satLow: 3.8, satHigh: 20.5, failHigh: 21.0 };

/** Estado de la señal según NAMUR NE 43. */
export function namurStatus(mA) {
  if (mA <= NAMUR.failLow) return 'fallo-bajo';
  if (mA >= NAMUR.failHigh) return 'fallo-alto';
  if (mA < SIGNAL_MIN_MA) return 'bajo-rango';
  if (mA > SIGNAL_MAX_MA) return 'sobre-rango';
  return 'ok';
}

export function mAToPercent(mA) {
  return ((mA - SIGNAL_MIN_MA) / (SIGNAL_MAX_MA - SIGNAL_MIN_MA)) * 100;
}

export function percentToMA(pct) {
  return SIGNAL_MIN_MA + (pct / 100) * (SIGNAL_MAX_MA - SIGNAL_MIN_MA);
}

/**
 * % de señal -> valor de proceso.
 * Con `sqrt` (transmisor de ΔP lineal en ΔP usado para caudal) el caudal es proporcional
 * a la raíz cuadrada de la señal: PV = LRV + (URV-LRV)·√(%/100).
 */
export function percentToPV(pct, lrv, urv, sqrt = false) {
  let frac = pct / 100;
  if (sqrt) frac = frac <= 0 ? 0 : Math.sqrt(frac);
  return lrv + frac * (urv - lrv);
}

export function pvToPercent(pv, lrv, urv, sqrt = false) {
  if (urv === lrv) throw new RangeError('URV y LRV no pueden ser iguales');
  let frac = (pv - lrv) / (urv - lrv);
  if (sqrt) frac = frac <= 0 ? 0 : frac * frac;
  return frac * 100;
}
