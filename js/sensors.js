// Sensores de orientación del teléfono: nivel de burbuja y brújula.
//
// Todo el cálculo es puro y se prueba en tests/sensors.test.js. Lo único que toca el
// navegador es createOrientationSource() (permisos y eventos), que recibe `win` para poder
// probarse con un objeto falso.
//
// Convenciones (W3C DeviceOrientation): ejes del teléfono x = derecha, y = arriba de la
// pantalla, z = sale de la pantalla; mundo x = este, y = norte, z = arriba.
// Rotación dispositivo → mundo = Rz(alpha)·Rx(beta)·Ry(gamma).

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// Inclinación (nivel de burbuja)
// ---------------------------------------------------------------------------

/**
 * Dirección «arriba» (vertical hacia el cielo) expresada en los ejes del teléfono.
 * Sin ángulos de Euler: no se rompe con el teléfono de pie (beta = 90°).
 * Plano boca arriba → (0, 0, 1); de pie en vertical → (0, 1, 0).
 */
export function upVector(beta, gamma) {
  const b = beta * RAD;
  const g = gamma * RAD;
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
}

/**
 * La pantalla puede estar girada (screen.orientation.angle = 0, 90, 180, 270) aunque los
 * sensores sigan en los ejes físicos del teléfono. Devuelve (x, y) en los ejes de la pantalla.
 */
export function rotateForScreen([x, y], angle = 0) {
  switch (((angle % 360) + 360) % 360) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

const clamp1 = (v) => Math.max(-1, Math.min(1, v));
const asinDeg = (v) => Math.asin(clamp1(v)) * DEG;

export const LEVEL_MODES = {
  /** Teléfono apoyado sobre una superficie (mesa, tubería, bandeja, soporte). */
  flat: { label: 'Plano (teléfono acostado)', a: 'Lateral (borde derecho)', b: 'Longitudinal (borde superior)' },
  /** Teléfono de pie contra una pared, poste o tubería vertical (plomada). */
  upright: { label: 'Vertical (teléfono de pie)', a: 'Lateral (borde derecho)', b: 'Adelante / atrás (pantalla)' },
};

/**
 * Inclinación en grados de dos ejes y total.
 *  - flat:    a = elevación del borde derecho, b = elevación del borde superior.
 *  - upright: a = elevación del borde derecho, b = hacia dónde mira la pantalla
 *             (+ = hacia arriba, es decir, el teléfono se recuesta).
 * Positivo = ese lado/eje está más alto. `zero` ({a, b}) se resta: sirve para anular
 * la funda o un sensor mal calibrado (ver la prueba de giro de 180° en la ayuda).
 * `faceDown` avisa si el teléfono está boca abajo en modo plano (la lectura se invierte).
 */
export function readInclination(up, mode = 'flat', zero = { a: 0, b: 0 }) {
  const [ux, uy, uz] = up;
  const rawA = asinDeg(ux);
  const rawB = mode === 'upright' ? asinDeg(uz) : asinDeg(uy);
  const a = rawA - (zero.a || 0);
  const b = rawB - (zero.b || 0);
  return {
    a, b, rawA, rawB,
    total: Math.hypot(a, b),
    faceDown: mode === 'flat' ? uz < 0 : uy < 0,
  };
}

/** Pendiente de un ángulo en grados: %, mm/m y relación 1:N (Infinity si es 0). */
export function slope(deg) {
  const t = Math.tan(deg * RAD);
  return { pct: t * 100, mmPerM: t * 1000, ratio: t === 0 ? Infinity : 1 / Math.abs(t) };
}

/** ¿Nivelado? Los sensores de un teléfono rondan ±0,5°, no se pide menos. */
export const LEVEL_TOLERANCE_DEG = 0.5;
export const isLevel = (total, tol = LEVEL_TOLERANCE_DEG) => total <= tol;

/** Filtro exponencial (k = 0 congela, 1 no filtra). */
export const lowPass = (prev, next, k = 0.3) => (prev === null || prev === undefined ? next : prev + k * (next - prev));

// ---------------------------------------------------------------------------
// Rumbo (brújula)
// ---------------------------------------------------------------------------

/** Lleva un ángulo a [0, 360). */
export const normalizeDeg = (d) => ((d % 360) + 360) % 360;

/** Diferencia mínima con signo entre dos rumbos, en (−180, 180]. */
export function angleDiff(from, to) {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Filtro exponencial sobre un ángulo (no se rompe al pasar de 359° a 0°). */
export function smoothAngle(prev, next, k = 0.25) {
  if (prev === null || prev === undefined) return normalizeDeg(next);
  return normalizeDeg(prev + k * angleDiff(prev, next));
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
/** Punto cardinal de 16 vientos, en español (O = oeste). */
export const cardinal = (deg) => POINTS[Math.round(normalizeDeg(deg) / 22.5) % 16];

/**
 * Rumbo magnético (° desde el norte, horario) a partir de alpha/beta/gamma ABSOLUTOS
 * (referidos al norte de la Tierra, no a una orientación arbitraria).
 * Apunta el borde superior del teléfono si está más bien acostado, y la cámara trasera si
 * está más bien de pie. Con 45° de inclinación ambos dan el mismo rumbo, así que no hay saltos.
 */
export function compassHeading(alpha, beta, gamma) {
  const a = alpha * RAD, b = beta * RAD, g = gamma * RAD;
  const top = [-Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b)];
  const back = [
    -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g),
    -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g),
  ];
  const v = Math.hypot(...top) >= Math.hypot(...back) ? top : back;
  return normalizeDeg(Math.atan2(v[0], v[1]) * DEG);
}

/**
 * Rumbo verdadero = magnético + declinación (este positivo, oeste negativo).
 * La declinación cambia con el lugar y los años: se consulta antes y se escribe a mano.
 */
export const trueHeading = (magnetic, declination = 0) => normalizeDeg(magnetic + declination);

/**
 * Rumbo magnético de un evento de orientación, o null si no es utilizable.
 *  - iOS: `webkitCompassHeading` (ya referido al norte magnético).
 *  - Android/otros: alpha/beta/gamma solo si el evento es absoluto
 *    (`deviceorientationabsolute`, o `absolute === true`). Un alpha relativo no apunta al norte.
 * Devuelve { heading, accuracy, source } (accuracy en ° si el sistema la da).
 */
export function headingFromEvent(e) {
  if (!e) return null;
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    const acc = e.webkitCompassAccuracy;
    return {
      heading: normalizeDeg(e.webkitCompassHeading),
      accuracy: typeof acc === 'number' && acc >= 0 ? acc : null, // −1 = sin calibrar
      uncalibrated: typeof acc === 'number' && acc < 0,
      source: 'ios',
    };
  }
  const absolute = e.type === 'deviceorientationabsolute' || e.absolute === true;
  if (!absolute) return null;
  if (![e.alpha, e.beta, e.gamma].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { heading: compassHeading(e.alpha, e.beta, e.gamma), accuracy: null, uncalibrated: false, source: 'absolute' };
}

// ---------------------------------------------------------------------------
// Acceso a los sensores (permiso + eventos). Es lo único que usa el navegador.
// ---------------------------------------------------------------------------

/** ¿Hay API de orientación y en qué condiciones? */
export function sensorSupport(win = globalThis) {
  const DOE = win.DeviceOrientationEvent;
  return {
    api: typeof DOE !== 'undefined',
    needsPermission: typeof DOE?.requestPermission === 'function', // iOS 13+
    secure: win.isSecureContext !== false, // los sensores exigen HTTPS (o localhost)
    hasAbsolute: 'ondeviceorientationabsolute' in win,
  };
}

/**
 * Fuente de eventos de orientación.
 *   const src = createOrientationSource();
 *   const r = await src.start(onEvent, onNoData);  // llamar desde un toque del usuario
 *   src.stop();
 * start() devuelve 'ok' | 'unsupported' | 'insecure' | 'denied'. onEvent recibe cada evento con
 * datos reales; si en `noDataMs` no llega ninguno (escritorio, sin sensor) se llama a onNoData.
 * `absolute: true` escucha `deviceorientationabsolute` cuando existe (Android).
 */
export function createOrientationSource(win = globalThis, { noDataMs = 2000 } = {}) {
  let stopFns = [];
  let timer = null;

  function stop() {
    for (const f of stopFns) f();
    stopFns = [];
    clearTimeout(timer);
    timer = null;
  }

  async function start(onEvent, onNoData, { absolute = false } = {}) {
    stop();
    const sup = sensorSupport(win);
    if (!sup.api) return 'unsupported';
    if (!sup.secure) return 'insecure';
    if (sup.needsPermission) {
      try {
        if ((await win.DeviceOrientationEvent.requestPermission()) !== 'granted') return 'denied';
      } catch {
        return 'denied'; // sin gesto del usuario, o el usuario lo rechazó
      }
    }
    const type = absolute && sup.hasAbsolute ? 'deviceorientationabsolute' : 'deviceorientation';
    let got = false;
    const handler = (e) => {
      const real = [e.alpha, e.beta, e.gamma].some((v) => typeof v === 'number') || typeof e.webkitCompassHeading === 'number';
      if (!real) return; // el escritorio dispara un evento con todo en null
      got = true;
      onEvent(e);
    };
    win.addEventListener(type, handler);
    stopFns.push(() => win.removeEventListener(type, handler));
    timer = setTimeout(() => { if (!got) onNoData?.(); }, noDataMs);
    return 'ok';
  }

  return { start, stop };
}

/** Texto para cada resultado de start() que no sea 'ok'. */
export const SENSOR_PROBLEMS = {
  unsupported: 'Este navegador no ofrece sensores de orientación. Abre la app en el navegador del teléfono (Chrome en Android, Safari en iPhone).',
  insecure: 'Los sensores solo funcionan con una conexión segura (https). Abre la app desde su dirección de GitHub Pages.',
  denied: 'Permiso denegado. En iPhone: Ajustes → Safari → «Movimiento y orientación», o cierra la pestaña y vuelve a abrirla para que pregunte de nuevo.',
  nodata: 'No llegan datos de los sensores. Es lo normal en un ordenador: esta herramienta es para el teléfono.',
};
