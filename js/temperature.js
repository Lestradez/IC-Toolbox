// Sensores de temperatura: RTD y termopares. Funciones puras (sin DOM), en °C, Ω y mV.
//
// RTD
//   Pt (IEC 60751, α = 0,00385): Callendar-Van Dusen.
//     t ≥ 0 °C: R = R0 (1 + A t + B t²)
//     t < 0 °C: R = R0 (1 + A t + B t² + C (t − 100) t³)
//   Ni100 / Ni1000 (DIN 43760, α = 0,00618): R = R0 (1 + A t + B t² + D t⁴ + F t⁶).
//   Ni120 (α = 0,00672, «Edison curve 7»): no tiene fórmula normalizada; se interpola
//     (Hermite cúbica) la tabla de Minco cada 10 °C. Error frente a la tabla de 1 °C < 0,002 Ω.
//
// Termopares (ITS-90, NIST SRD 60 = IEC 60584-1:2013)
//   Directo: polinomios de referencia de NIST (más el término exponencial del tipo K).
//   Inverso: se resuelve numéricamente sobre el polinomio directo (bisección + Newton), así
//   directo e inverso son coherentes entre sí. Los polinomios inversos de NIST tienen errores
//   de hasta ±0,06 °C; aquí el error de la inversión es < 0,0001 °C.

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

/** Evalúa c[0] + c[1]x + c[2]x² + … (Horner). */
function poly(c, x) {
  let y = 0;
  for (let i = c.length - 1; i >= 0; i--) y = y * x + c[i];
  return y;
}

/** Derivada de poly(c, x). */
function dpoly(c, x) {
  let y = 0;
  for (let i = c.length - 1; i >= 1; i--) y = y * x + i * c[i];
  return y;
}

/**
 * Resuelve f(x) = y para f creciente en [lo, hi]. Bisección (robusta) y, al final, un par de
 * pasos de Newton si se pasa la derivada. Devuelve NaN si y está fuera de [f(lo), f(hi)].
 */
function solveIncreasing(f, y, lo, hi, df, tol = 1e-9) {
  let flo = f(lo);
  let fhi = f(hi);
  // Holgura en los extremos para valores de tabla redondeados (18,52 Ω = −200 °C en un Pt100).
  const slack = 1e-5 * (fhi - flo);
  if (!(y >= flo - slack && y <= fhi + slack)) return NaN;
  if (y <= flo) return lo;
  if (y >= fhi) return hi;
  for (let i = 0; i < 200 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm < y) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  let x = (lo + hi) / 2;
  if (df) {
    for (let i = 0; i < 2; i++) {
      const d = df(x);
      if (!(d > 0)) break;
      const nx = x - (f(x) - y) / d;
      if (nx < lo || nx > hi) break;
      x = nx;
    }
  }
  return x;
}

/** Derivada numérica centrada. */
const numDeriv = (f, x, h = 1e-3) => (f(x + h) - f(x - h)) / (2 * h);

// ---------------------------------------------------------------------------
// RTD
// ---------------------------------------------------------------------------

/** Coeficientes Callendar-Van Dusen de IEC 60751 (α = 0,00385). */
export const CVD = { A: 3.9083e-3, B: -5.775e-7, C: -4.183e-12 };

/** Coeficientes de DIN 43760 para níquel (α = 0,00618). */
export const NI_DIN = { A: 5.485e-3, B: 6.65e-6, D: 2.805e-11, F: -2e-17 };

/** Tabla Ni120 (Minco, TCR 0,00672) de −80 a 260 °C cada 10 °C, en Ω. */
const NI120_T0 = -80;
const NI120_STEP = 10;
const NI120_TABLE = [
  66.6000, 73.1032, 79.6200, 86.1647, 92.7552, 99.4100, 106.150, 113.003, 120.000,
  127.168, 134.518, 142.060, 149.800, 157.745, 165.900, 174.268, 182.849, 191.639,
  200.640, 209.854, 219.290, 228.950, 238.836, 248.950, 259.295, 269.894, 280.770,
  291.949, 303.455, 315.309, 327.535, 340.143, 353.140, 366.531, 380.310,
];

/** Pendiente en el nodo k (diferencias centradas; de un lado en los extremos). */
function ni120Slope(k) {
  const R = NI120_TABLE;
  const h = NI120_STEP;
  const n = R.length - 1;
  if (k === 0) return (-3 * R[0] + 4 * R[1] - R[2]) / (2 * h);
  if (k === n) return (3 * R[n] - 4 * R[n - 1] + R[n - 2]) / (2 * h);
  return (R[k + 1] - R[k - 1]) / (2 * h);
}

function ni120(t) {
  const h = NI120_STEP;
  const i = Math.min(Math.floor((t - NI120_T0) / h), NI120_TABLE.length - 2);
  const s = (t - (NI120_T0 + i * h)) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * NI120_TABLE[i] + (s3 - 2 * s2 + s) * h * ni120Slope(i)
    + (-2 * s3 + 3 * s2) * NI120_TABLE[i + 1] + (s3 - s2) * h * ni120Slope(i + 1);
}

function pt(R0, t) {
  const { A, B, C } = CVD;
  return t >= 0 ? R0 * (1 + A * t + B * t * t) : R0 * (1 + A * t + B * t * t + C * (t - 100) * t ** 3);
}

function niDin(R0, t) {
  const { A, B, D, F } = NI_DIN;
  return R0 * (1 + A * t + B * t * t + D * t ** 4 + F * t ** 6);
}

/**
 * Tipos de RTD. tmin/tmax: rango de la norma o de la tabla (°C).
 * @type {Record<string, {label: string, R0: number, alpha: number, std: string, tmin: number, tmax: number, R: (t: number) => number}>}
 */
export const RTD_TYPES = {
  pt100: { label: 'Pt100', R0: 100, alpha: 0.00385, std: 'IEC 60751', tmin: -200, tmax: 850, R: (t) => pt(100, t) },
  pt500: { label: 'Pt500', R0: 500, alpha: 0.00385, std: 'IEC 60751', tmin: -200, tmax: 850, R: (t) => pt(500, t) },
  pt1000: { label: 'Pt1000', R0: 1000, alpha: 0.00385, std: 'IEC 60751', tmin: -200, tmax: 850, R: (t) => pt(1000, t) },
  ni100: { label: 'Ni100', R0: 100, alpha: 0.00618, std: 'DIN 43760', tmin: -60, tmax: 250, R: (t) => niDin(100, t) },
  ni1000: { label: 'Ni1000', R0: 1000, alpha: 0.00618, std: 'DIN 43760', tmin: -60, tmax: 250, R: (t) => niDin(1000, t) },
  ni120: { label: 'Ni120', R0: 120, alpha: 0.00672, std: 'Edison curve 7 (tabla Minco)', tmin: -80, tmax: 260, R: ni120 },
};

/** Resistencia (Ω) de la RTD a t (°C). NaN fuera del rango del tipo. */
export function rtdResistance(type, t) {
  const s = RTD_TYPES[type];
  if (!s || !Number.isFinite(t) || t < s.tmin || t > s.tmax) return NaN;
  return s.R(t);
}

/** Temperatura (°C) de la RTD a partir de su resistencia (Ω). NaN fuera de rango. */
export function rtdTemperature(type, R) {
  const s = RTD_TYPES[type];
  if (!s || !Number.isFinite(R)) return NaN;
  if (type.startsWith('pt') && R >= s.R0) {
    // Rama t ≥ 0 de Callendar-Van Dusen: solución cerrada de la cuadrática.
    const { A, B } = CVD;
    const t = (-A + Math.sqrt(A * A - 4 * B * (1 - R / s.R0))) / (2 * B);
    return t <= s.tmax + 1e-9 ? Math.min(t, s.tmax) : NaN;
  }
  return solveIncreasing(s.R, R, s.tmin, s.tmax, (t) => numDeriv(s.R, t));
}

/** Sensibilidad dR/dt (Ω/°C) a t. */
export function rtdSensitivity(type, t) {
  const s = RTD_TYPES[type];
  if (!s) return NaN;
  const h = 1e-3;
  const a = Math.max(s.tmin, t - h);
  const b = Math.min(s.tmax, t + h);
  return (s.R(b) - s.R(a)) / (b - a);
}

// ---------------------------------------------------------------------------
// Termopares
// ---------------------------------------------------------------------------

// Coeficientes de NIST SRD 60 (ITS-90), en orden c0, c1, c2…: E (mV) = Σ ci tⁱ, t en °C.
// Cada tramo: [tmin, tmax, coeficientes].
const TC_DATA = {
  B: {
    pos: '70Pt-30Rh', neg: '94Pt-6Rh',
    ranges: [
      [0, 630.615, [
        0, -0.246508183460e-3, 0.590404211710e-5, -0.132579316360e-8, 0.156682919010e-11,
        -0.169445292400e-14, 0.629903470940e-18]],
      [630.615, 1820, [
        -0.389381686210e1, 0.285717474700e-1, -0.848851047850e-4, 0.157852801640e-6,
        -0.168353448640e-9, 0.111097940130e-12, -0.445154310330e-16, 0.989756408210e-20,
        -0.937913302890e-24]],
    ],
  },
  E: {
    pos: 'Ni-Cr (cromel)', neg: 'Cu-Ni (constantán)',
    ranges: [
      [-270, 0, [
        0, 0.586655087080e-1, 0.454109771240e-4, -0.779980486860e-6, -0.258001608430e-7,
        -0.594525830570e-9, -0.932140586670e-11, -0.102876055340e-12, -0.803701236210e-15,
        -0.439794973910e-17, -0.164147763550e-19, -0.396736195160e-22, -0.558273287210e-25,
        -0.346578420130e-28]],
      [0, 1000, [
        0, 0.586655087100e-1, 0.450322755820e-4, 0.289084072120e-7, -0.330568966520e-9,
        0.650244032700e-12, -0.191974955040e-15, -0.125366004970e-17, 0.214892175690e-20,
        -0.143880417820e-23, 0.359608994810e-27]],
    ],
  },
  J: {
    pos: 'Fe (hierro)', neg: 'Cu-Ni (constantán)',
    ranges: [
      [-210, 760, [
        0, 0.503811878150e-1, 0.304758369300e-4, -0.856810657200e-7, 0.132281952950e-9,
        -0.170529583370e-12, 0.209480906970e-15, -0.125383953360e-18, 0.156317256970e-22]],
      [760, 1200, [
        0.296456256810e3, -0.149761277860e1, 0.317871039240e-2, -0.318476867010e-5,
        0.157208190040e-8, -0.306913690560e-12]],
    ],
  },
  K: {
    pos: 'Ni-Cr (cromel)', neg: 'Ni-Al (alumel)',
    ranges: [
      [-270, 0, [
        0, 0.394501280250e-1, 0.236223735980e-4, -0.328589067840e-6, -0.499048287770e-8,
        -0.675090591730e-10, -0.574103274280e-12, -0.310888728940e-14, -0.104516093650e-16,
        -0.198892668780e-19, -0.163226974860e-22]],
      [0, 1372, [
        -0.176004136860e-1, 0.389212049750e-1, 0.185587700320e-4, -0.994575928740e-7,
        0.318409457190e-9, -0.560728448890e-12, 0.560750590590e-15, -0.320207200030e-18,
        0.971511471520e-22, -0.121047212750e-25]],
    ],
    // Término exponencial del segundo tramo (t > 0): a0 · exp(a1 (t − a2)²).
    exp: { a0: 0.1185976, a1: -0.1183432e-3, a2: 126.9686 },
  },
  N: {
    pos: 'Ni-Cr-Si (nicrosil)', neg: 'Ni-Si (nisil)',
    ranges: [
      [-270, 0, [
        0, 0.261591059620e-1, 0.109574842280e-4, -0.938411115540e-7, -0.464120397590e-10,
        -0.263033577160e-11, -0.226534380030e-13, -0.760893007910e-16, -0.934196678350e-19]],
      [0, 1300, [
        0, 0.259293946010e-1, 0.157101418800e-4, 0.438256272370e-7, -0.252611697940e-9,
        0.643118193390e-12, -0.100634715190e-14, 0.997453389920e-18, -0.608632456070e-21,
        0.208492293390e-24, -0.306821961510e-28]],
    ],
  },
  R: {
    pos: '87Pt-13Rh', neg: 'Pt',
    ranges: [
      [-50, 1064.18, [
        0, 0.528961729765e-2, 0.139166589782e-4, -0.238855693017e-7, 0.356916001063e-10,
        -0.462347666298e-13, 0.500777441034e-16, -0.373105886191e-19, 0.157716482367e-22,
        -0.281038625251e-26]],
      [1064.18, 1664.5, [
        0.295157925316e1, -0.252061251332e-2, 0.159564501865e-4, -0.764085947576e-8,
        0.205305291024e-11, -0.293359668173e-15]],
      [1664.5, 1768.1, [
        0.152232118209e3, -0.268819888545, 0.171280280471e-3, -0.345895706453e-7,
        -0.934633971046e-14]],
    ],
  },
  S: {
    pos: '90Pt-10Rh', neg: 'Pt',
    ranges: [
      [-50, 1064.18, [
        0, 0.540313308631e-2, 0.125934289740e-4, -0.232477968689e-7, 0.322028823036e-10,
        -0.331465196389e-13, 0.255744251786e-16, -0.125068871393e-19, 0.271443176145e-23]],
      [1064.18, 1664.5, [
        0.132900444085e1, 0.334509311344e-2, 0.654805192818e-5, -0.164856259209e-8,
        0.129989605174e-13]],
      [1664.5, 1768.1, [
        0.146628232636e3, -0.258430516752, 0.163693574641e-3, -0.330439046987e-7,
        -0.943223690612e-14]],
    ],
  },
  T: {
    pos: 'Cu (cobre)', neg: 'Cu-Ni (constantán)',
    ranges: [
      [-270, 0, [
        0, 0.387481063640e-1, 0.441944343470e-4, 0.118443231050e-6, 0.200329735540e-7,
        0.901380195590e-9, 0.226511565930e-10, 0.360711542050e-12, 0.384939398830e-14,
        0.282135219250e-16, 0.142515947790e-18, 0.487686622860e-21, 0.107955392700e-23,
        0.139450270620e-26, 0.797951539270e-30]],
      [0, 400, [
        0, 0.387481063640e-1, 0.332922278800e-4, 0.206182434040e-6, -0.218822568460e-8,
        0.109968809280e-10, -0.308157587720e-13, 0.454791352900e-16, -0.275129016730e-19]],
    ],
  },
};

// Rango en el que la f.e.m. es monótona y se puede invertir. El tipo B no es monótono por
// debajo de ~42 °C (E ≈ 0 entre 0 y 42 °C): desde 50 °C. NIST da sus polinomios inversos
// desde −200 °C (J: −210) y para B desde 250 °C: por debajo, la sensibilidad es muy baja.
const TC_INVERSE_MIN = { B: 50, E: -270, J: -210, K: -270, N: -270, R: -50, S: -50, T: -270 };
const TC_ACCURATE_MIN = { B: 250, E: -200, J: -210, K: -200, N: -200, R: -50, S: -50, T: -200 };

/**
 * Tipos de termopar. tmin/tmax: rango de la tabla de referencia (°C).
 * invMin: menor temperatura que se calcula desde mV. lowSens: por debajo, sensibilidad baja.
 */
export const TC_TYPES = Object.fromEntries(Object.entries(TC_DATA).map(([k, d]) => [k, {
  label: `Tipo ${k}`,
  pos: d.pos,
  neg: d.neg,
  tmin: d.ranges[0][0],
  tmax: d.ranges[d.ranges.length - 1][1],
  invMin: TC_INVERSE_MIN[k],
  lowSens: TC_ACCURATE_MIN[k],
}]));

/** Índice del tramo que contiene t. */
function tcSegment(d, t) {
  const i = d.ranges.findIndex((seg) => t <= seg[1]);
  return i < 0 ? d.ranges.length - 1 : i;
}

function emfRaw(type, t) {
  const d = TC_DATA[type];
  const i = tcSegment(d, t);
  let e = poly(d.ranges[i][2], t);
  if (d.exp && i === 1) e += d.exp.a0 * Math.exp(d.exp.a1 * (t - d.exp.a2) ** 2);
  return e;
}

function seebeckRaw(type, t) {
  const d = TC_DATA[type];
  const i = tcSegment(d, t);
  let s = dpoly(d.ranges[i][2], t);
  if (d.exp && i === 1) {
    const u = t - d.exp.a2;
    s += d.exp.a0 * Math.exp(d.exp.a1 * u * u) * 2 * d.exp.a1 * u;
  }
  return s;
}

/** F.e.m. (mV) del termopar con la junta de referencia a 0 °C. NaN fuera de rango. */
export function tcEmf(type, t) {
  const s = TC_TYPES[type];
  if (!s || !Number.isFinite(t) || t < s.tmin || t > s.tmax) return NaN;
  return emfRaw(type, t);
}

/** Coeficiente de Seebeck dE/dt (µV/°C) a t. */
export function tcSeebeck(type, t) {
  const s = TC_TYPES[type];
  if (!s || !Number.isFinite(t) || t < s.tmin || t > s.tmax) return NaN;
  return seebeckRaw(type, t) * 1000;
}

/** Temperatura (°C) desde la f.e.m. referida a 0 °C (mV). NaN fuera de rango. */
export function tcTemperature(type, emf) {
  const s = TC_TYPES[type];
  if (!s || !Number.isFinite(emf)) return NaN;
  return solveIncreasing((t) => emfRaw(type, t), emf, s.invMin, s.tmax, (t) => seebeckRaw(type, t));
}

/**
 * Compensación de junta fría. Lo que mide un milivoltímetro en bornes es
 * E(t) − E(tcj); la temperatura del proceso sale de E(t) = mV medidos + E(tcj).
 */
export function tcMeasuredToTemp(type, mV, tcj) {
  return tcTemperature(type, mV + tcEmf(type, tcj));
}

/** mV que aparecen en bornes (junta fría a tcj) con la junta caliente a t. */
export function tcTempToMeasured(type, t, tcj) {
  return tcEmf(type, t) - tcEmf(type, tcj);
}
