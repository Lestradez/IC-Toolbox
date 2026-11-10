// Estadísticas de uso anónimas con GoatCounter (sin cookies, sin identificadores).
//
// Qué se envía: ruta de la herramienta abierta («/orifice»), versión de la app y, si algo
// falla, el mensaje de error truncado y el archivo (sin ruta ni parámetros). Nunca se envían
// los valores que el usuario escribe en las calculadoras.
//
// Se usa el «pixel» de GoatCounter (una petición GET de imagen) en vez de cargar su
// count.js: no hay script de terceros, y el service worker no interviene (solo atiende
// el mismo origen). Sin conexión los envíos quedan en una cola pequeña y se mandan al volver.
import { loadState, saveState } from './ui.js';

const MAX_QUEUE = 30;
const MAX_ERRORS_PER_SESSION = 5;

/** URL del pixel de GoatCounter. `event` = true cuenta un evento en vez de una visita. */
export function beaconUrl(code, { path, title = '', event = false, version = '' }) {
  const q = new URLSearchParams();
  q.set('p', path.slice(0, 200));
  if (title) q.set('t', title.slice(0, 100));
  if (event) q.set('e', 'true');
  if (version) q.set('q', `v=${version}`.slice(0, 60)); // aparece como parámetro de consulta
  q.set('rnd', Math.random().toString(36).slice(2, 8)); // evita que se cachee
  return `https://${code}.goatcounter.com/count?${q}`;
}

/** Texto corto y sin datos personales para un error de JavaScript. */
export function describeError(message, source = '', line = 0) {
  const file = String(source || '').split(/[?#]/)[0].split('/').pop();
  const msg = String(message || 'error').replace(/\s+/g, ' ').trim().slice(0, 100);
  return file ? `${msg} @${file}${line ? `:${line}` : ''}` : msg;
}

/** Cola de envíos pendientes (para offline). Funciones puras sobre un array. */
export function enqueue(queue, item) {
  return [...queue, item].slice(-MAX_QUEUE);
}

/**
 * @param {object} opts
 * @param {string} opts.code        código GoatCounter ('' = apagado)
 * @param {string} opts.version
 * @param {(url: string) => Promise<boolean>} [opts.send]  inyectable para tests
 */
export function createAnalytics({ code, version, send = sendPixel, getEnabled = defaultEnabled, isOnline = () => navigator.onLine }) {
  let errorsSent = 0;
  const active = () => !!code && getEnabled();

  async function flush() {
    if (!active() || !isOnline()) return;
    const queue = loadState('beacons') || [];
    if (!queue.length) return;
    saveState('beacons', []);
    for (const url of queue) {
      if (!(await send(url))) saveState('beacons', enqueue(loadState('beacons') || [], url));
    }
  }

  async function track(opts) {
    if (!active()) return;
    const url = beaconUrl(code, { ...opts, version });
    if (!isOnline() || !(await send(url))) saveState('beacons', enqueue(loadState('beacons') || [], url));
  }

  return {
    pageview: (path, title) => track({ path, title }),
    event: (name) => track({ path: name, event: true }),
    /** Cuenta un error como evento «error/<herramienta>/<mensaje>». Máx. 5 por sesión. */
    error(tool, message, source, line) {
      if (errorsSent >= MAX_ERRORS_PER_SESSION) return;
      errorsSent++;
      return track({ path: `error/${tool}/${describeError(message, source, line)}`, event: true });
    },
    flush,
  };
}

/** Preferencia del usuario (pie de la app) y «No rastrear» del navegador. */
export function defaultEnabled() {
  if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return false;
  return loadState('analytics') !== false;
}

function sendPixel(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** Engancha los errores globales de la página. */
export function watchErrors(analytics, getTool) {
  window.addEventListener('error', (e) => analytics.error(getTool(), e.message, e.filename, e.lineno));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    analytics.error(getTool(), r && r.message ? r.message : String(r));
  });
}
