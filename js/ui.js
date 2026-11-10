// Utilidades de interfaz compartidas por las vistas.

/** Acepta coma o punto decimal. Devuelve NaN si no es un número. */
export function parseNum(str) {
  const s = String(str).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || s === '-' || s === '.') return NaN;
  return Number(s);
}

const formatters = new Map();
/** Formatea con `sig` cifras significativas, coma decimal y sin separador de miles. */
export function fmt(n, sig = 6) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a !== 0 && (a < 1e-4 || a >= 1e9)) return n.toExponential(sig - 1).replace('.', ',');
  if (!formatters.has(sig)) {
    formatters.set(sig, new Intl.NumberFormat('es-ES', { maximumSignificantDigits: sig, useGrouping: false }));
  }
  return formatters.get(sig).format(n);
}

/** Formatea con `dec` decimales fijos. */
export function fmtFixed(n, dec) {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(dec).replace('.', ',');
}

export const $ = (id) => document.getElementById(id);
