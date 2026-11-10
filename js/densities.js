// Densidad (y viscosidad) de fluidos comunes de proceso. Módulo puro: sin DOM.
//
// Líquidos puros y glicoles: tablas cada 5 °C generadas con CoolProp (scripts/densities_reference.py)
// e interpoladas con un polinomio cúbico de 4 puntos; la viscosidad se interpola en ln(μ).
// Gases: ecuación de estado de Peng-Robinson con las constantes críticas de CoolProp.
// Productos de petróleo: corrección de volumen de API MPMS 11.1 (aproximación, ver petroleumDensity).
// Vapor de agua saturado: tabla de IAPWS-95 (CoolProp) interpolada en ln p.
import { DATA } from './densities-data.js';
import { R_GAS } from './orifice.js';

export { DATA };

/** Densidad del agua a 60 °F (15,56 °C), base de la definición de °API y de la SG 60/60 (kg/m³). */
export const RHO_WATER_60F = 999.016;

// ---------------------------------------------------------------- interpolación

/** Interpolación cúbica de Lagrange con 4 puntos igualmente espaciados (los 4 más cercanos a x). */
function lagrange4(ys, t0, step, x) {
  const n = ys.length;
  const pos = (x - t0) / step;
  let i0 = Math.floor(pos) - 1;
  i0 = Math.max(0, Math.min(n - 4, i0));
  let s = 0;
  for (let i = 0; i < 4; i++) {
    let w = 1;
    for (let j = 0; j < 4; j++) if (j !== i) w *= (pos - (i0 + j)) / (i - j);
    s += w * ys[i0 + i];
  }
  return s;
}

/** Líquidos y mezclas agua-glicol, en el orden en que se muestran. */
export const LIQUIDS = [...DATA.liquids, ...DATA.glycols];

export const liquidById = (id) => LIQUIDS.find((l) => l.id === id);

/** Rango de temperatura (°C) de la tabla de un líquido. */
export const liquidRange = (l) => [l.t0, l.t0 + l.step * (l.rho.length - 1)];

/**
 * Densidad (kg/m³) y viscosidad dinámica (mPa·s, o null si no hay dato fiable) de un líquido a T (°C).
 * Lanza RangeError fuera del rango tabulado: extrapolar un polinomio es peor que decir que no hay dato.
 */
export function liquidProps(id, tC) {
  const l = liquidById(id);
  if (!l) throw new Error(`Líquido desconocido: ${id}`);
  const [lo, hi] = liquidRange(l);
  if (!Number.isFinite(tC)) throw new RangeError('Falta la temperatura.');
  if (tC < lo || tC > hi) throw new RangeError(`${l.name}: la tabla cubre de ${lo} a ${hi} °C.`);
  const rho = lagrange4(l.rho, l.t0, l.step, tC);
  const mu = l.mu ? Math.exp(lagrange4(l.mu.map(Math.log), l.t0, l.step, tC)) : null;
  return { rho, mu };
}

// ---------------------------------------------------------------- mercurio

/** Mercurio: ρ = 13595,08 / (1 + 1,8182e-4·T), T en °C (dilatación volumétrica media 0-100 °C). */
export const MERCURY = { rho0: 13595.08, beta: 1.8182e-4, lo: -10, hi: 100 };

export function mercuryDensity(tC) {
  if (!(tC >= MERCURY.lo && tC <= MERCURY.hi)) throw new RangeError(`Mercurio: válido de ${MERCURY.lo} a ${MERCURY.hi} °C.`);
  return MERCURY.rho0 / (1 + MERCURY.beta * tC);
}

// ---------------------------------------------------------------- petróleo (API MPMS 11.1)

/**
 * Constantes de α = K0/ρ² + K1/ρ + K2 (ρ en kg/m³, α en 1/°F) de API MPMS 11.1 / ASTM D1250.
 * [min, max] es el rango de ρ a 15 °C (kg/m³) del grupo.
 */
export const PETROLEUM = {
  crude: { label: 'Petróleo crudo', K: [341.0957, 0, 0], range: [610.6, 1163.5] },
  gasoline: { label: 'Gasolina', K: [192.4571, 0.2438, 0], range: [653, 770] },
  transition: { label: 'Zona de transición (gasolina/jet)', K: [1489.067, 0, -0.0018684], range: [770, 787.5] },
  jet: { label: 'Jet / queroseno', K: [330.301, 0, 0], range: [787.5, 838.5] },
  fuel: { label: 'Gasóleo / diésel / fuel oil', K: [103.872, 0.2701, 0], range: [838.5, 1163.5] },
};

/** Grupo de producto refinado según su densidad a 15 °C. */
export function refinedGroup(rho15) {
  for (const k of ['gasoline', 'transition', 'jet', 'fuel']) {
    const [lo, hi] = PETROLEUM[k].range;
    if (rho15 >= lo && rho15 < hi) return k;
  }
  return rho15 < PETROLEUM.gasoline.range[0] ? 'gasoline' : 'fuel';
}

function vcf(group, rho15, tC) {
  const [k0, k1, k2] = PETROLEUM[group].K;
  const alpha = k0 / rho15 ** 2 + k1 / rho15 + k2;
  const dT = 1.8 * (tC - 15);
  return Math.exp(-alpha * dT * (1 + 0.8 * alpha * dT));
}

/**
 * Densidad a T (°C) de un petróleo o producto desde su densidad a 15 °C (kg/m³).
 * `group`: 'crude' o 'refined' (el grupo se elige por la densidad).
 * Aproximación: usa 15 °C como base en lugar de 60 °F, con ΔT = 1,8·(T − 15). No sustituye al
 * cálculo completo de API 11.1 (hay un residuo de décimas de kg/m³).
 * Lanza RangeError si ρ15 o T quedan fuera del campo de la norma (−50…150 °C).
 */
export function petroleumDensity(group, rho15, tC) {
  const g = group === 'refined' ? refinedGroup(rho15) : group;
  const pg = PETROLEUM[g];
  if (!pg) throw new Error(`Grupo desconocido: ${group}`);
  if (!(rho15 >= pg.range[0] && rho15 <= pg.range[1])) {
    throw new RangeError(`${pg.label}: la densidad a 15 °C debe estar entre ${pg.range[0]} y ${pg.range[1]} kg/m³.`);
  }
  if (!(tC >= -50 && tC <= 150)) throw new RangeError('Petróleo: temperatura entre −50 y 150 °C.');
  return { rho: rho15 * vcf(g, rho15, tC), group: g };
}

/** Densidad a 15 °C (kg/m³) desde la medida a T (°C): invierte petroleumDensity por iteración. */
export function petroleumDensityAt15(group, rhoObs, tC) {
  let r15 = rhoObs;
  for (let i = 0; i < 60; i++) {
    const g = group === 'refined' ? refinedGroup(r15) : group;
    const next = rhoObs / vcf(g, r15, tC);
    if (Math.abs(next - r15) < 1e-9) return next;
    r15 = next;
  }
  return r15;
}

/** Densidad relativa 60/60 °F desde °API: 141,5/(131,5 + °API). */
export const sgFromApi = (api) => 141.5 / (131.5 + api);
export const apiFromSg = (sg) => 141.5 / sg - 131.5;

/** α (1/°F) del grupo para una densidad dada. */
const alphaOf = (group, rho) => {
  const [k0, k1, k2] = PETROLEUM[group].K;
  return k0 / rho ** 2 + k1 / rho + k2;
};

/** Factor 60 °F / 15 °C: de 15 °C (59 °F) a 60 °F hay +1 °F. */
const factor60 = (group, rho15) => {
  const a = alphaOf(group, rho15);
  return Math.exp(-a * (1 + 0.8 * a));
};

/** Densidad a 15 °C (kg/m³) desde °API (la SG 60/60 se pasa de 60 °F a 15 °C con la corrección de volumen). */
export function rho15FromApi(api, group = 'crude') {
  const rho60 = sgFromApi(api) * RHO_WATER_60F;
  let r15 = rho60;
  for (let i = 0; i < 60; i++) {
    const g = group === 'refined' ? refinedGroup(r15) : group;
    const next = rho60 / factor60(g, r15);
    if (Math.abs(next - r15) < 1e-9) return next;
    r15 = next;
  }
  return r15;
}

/** °API de un petróleo desde su densidad a 15 °C. */
export function apiFromRho15(rho15, group = 'crude') {
  const g = group === 'refined' ? refinedGroup(rho15) : group;
  return apiFromSg((rho15 * factor60(g, rho15)) / RHO_WATER_60F);
}

// ---------------------------------------------------------------- elección unificada de líquido

const SRC_PETROLEUM = 'API MPMS 11.1 / ASTM D1250: factor de corrección de volumen con las constantes K0, K1, K2 del grupo (aproximación con base 15 °C)';
const SRC_MERCURY = 'Densidad del mercurio a 0 °C 13 595,08 kg/m³ y dilatación volumétrica media 1,8182·10⁻⁴ K⁻¹ (0-100 °C)';

/** Opciones de líquido agrupadas para un <select>: [{ label, items: [{ value, name }] }]. */
export function liquidChoices() {
  const groups = [];
  const add = (label, value, name) => {
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push({ value, name });
  };
  for (const l of LIQUIDS) add(l.group, l.id, l.name);
  add('Petróleo y derivados (ρ a 15 °C)', 'crude', 'Petróleo crudo');
  add('Petróleo y derivados (ρ a 15 °C)', 'refined', 'Producto refinado (gasolina, jet, gasóleo, fuel oil)');
  add('Otros', 'mercury', 'Mercurio');
  const order = ['Agua', 'Glicoles y anticongelantes', 'Petróleo y derivados (ρ a 15 °C)', 'Disolventes y combustibles', 'Gases licuados (saturado)', 'Otros'];
  return groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

/** ¿El líquido elegido necesita la densidad a 15 °C como dato? */
export const needsRho15 = (choice) => choice === 'crude' || choice === 'refined';

/**
 * Densidad de un líquido de liquidChoices() a T (°C).
 * @returns {{rho:number, mu:number|null, name:string, source:string, group?:string}}
 */
export function liquidAt(choice, tC, rho15) {
  if (choice === 'mercury') return { rho: mercuryDensity(tC), mu: null, name: 'Mercurio', source: SRC_MERCURY };
  if (needsRho15(choice)) {
    if (!Number.isFinite(tC)) throw new RangeError('Falta la temperatura.');
    if (!(rho15 > 0)) throw new RangeError('Falta la densidad a 15 °C.');
    const r = petroleumDensity(choice, rho15, tC);
    return {
      rho: r.rho, mu: null, group: r.group, name: PETROLEUM[r.group].label, source: SRC_PETROLEUM,
    };
  }
  const l = liquidById(choice);
  if (!l) throw new Error(`Líquido desconocido: ${choice}`);
  const p = liquidProps(choice, tC);
  return { rho: p.rho, mu: p.mu, name: l.name, source: l.source };
}

// ---------------------------------------------------------------- gases (Peng-Robinson)

export const GASES = DATA.gases;
export const gasById = (id) => GASES.find((g) => g.id === id);

const SQRT2 = Math.SQRT2;

function prParams(g, T) {
  const Tc = g.Tc;
  const Pc = g.Pc * 1e5;
  const w = g.omega;
  const m = 0.37464 + 1.54226 * w - 0.26992 * w * w;
  const alpha = (1 + m * (1 - Math.sqrt(T / Tc))) ** 2;
  return {
    a: 0.45724 * (R_GAS * Tc) ** 2 / Pc * alpha,
    b: 0.0778 * R_GAS * Tc / Pc,
  };
}

/** Raíces reales de Z³ + c2 Z² + c1 Z + c0 = 0, ordenadas. */
function cubicRoots(c2, c1, c0) {
  const p = c1 - (c2 * c2) / 3;
  const q = (2 * c2 ** 3) / 27 - (c2 * c1) / 3 + c0;
  const shift = -c2 / 3;
  const disc = (q * q) / 4 + p ** 3 / 27;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + shift];
  }
  const r = Math.sqrt(-(p ** 3) / 27);
  const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
  const m = 2 * Math.cbrt(r);
  return [0, 1, 2].map((k) => m * Math.cos((phi + 2 * Math.PI * k) / 3) + shift).sort((x, y) => x - y);
}

function prZRoots(A, B) {
  return cubicRoots(-(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B ** 3));
}

const lnPhi = (Z, A, B) =>
  Z - 1 - Math.log(Z - B) - (A / (2 * SQRT2 * B)) * Math.log((Z + (1 + SQRT2) * B) / (Z + (1 - SQRT2) * B));

/** Presión de saturación de Peng-Robinson (Pa) a T (K), o NaN si T ≥ Tc. */
export function prSaturationPressure(g, T) {
  if (T >= g.Tc) return NaN;
  const { a, b } = prParams(g, T);
  const Tr = T / g.Tc;
  let p = g.Pc * 1e5 * Math.exp(5.373 * (1 + g.omega) * (1 - 1 / Tr)); // Wilson
  for (let i = 0; i < 80; i++) {
    const A = (a * p) / (R_GAS * T) ** 2;
    const B = (b * p) / (R_GAS * T);
    const roots = prZRoots(A, B).filter((z) => z > B);
    if (roots.length < 2) { p *= roots.length === 1 && roots[0] > 0.5 ? 1.05 : 0.95; continue; }
    const f = lnPhi(roots[0], A, B) - lnPhi(roots[roots.length - 1], A, B);
    p *= Math.exp(f); // ln(φL/φV) > 0: el líquido es menos estable, la presión es menor que psat
    if (Math.abs(f) < 1e-10) break;
  }
  return p;
}

/**
 * Z, densidad y masa molar de un gas a T (K) y p (Pa absolutos), con Peng-Robinson.
 * `condensing` es true si p ≥ 0,9·psat (el modelo y el supuesto de gas dejan de valer).
 * @returns {{Z:number, rho:number, M:number, kappa:number, condensing:boolean, psat:number}}
 */
export function gasProps(id, T, p) {
  const g = gasById(id);
  if (!g) throw new Error(`Gas desconocido: ${id}`);
  if (!(T > 0) || !(p > 0)) throw new RangeError('Temperatura y presión deben ser mayores que 0 (absolutas).');
  const { a, b } = prParams(g, T);
  const A = (a * p) / (R_GAS * T) ** 2;
  const B = (b * p) / (R_GAS * T);
  const roots = prZRoots(A, B).filter((z) => z > B);
  const Z = roots[roots.length - 1];
  const M = g.M / 1000;
  const psat = prSaturationPressure(g, T);
  return { Z, rho: (p * M) / (Z * R_GAS * T), M: g.M, kappa: g.kappa, condensing: Number.isFinite(psat) && p >= 0.9 * psat, psat };
}

// ---------------------------------------------------------------- vapor de agua saturado

export const STEAM = DATA.steam;

/** Vapor saturado a p (bar absolutos): { T (°C), rhoV, rhoL (kg/m³) }, interpolado en ln p. */
export function steamSaturated(pBar) {
  const lp = STEAM.p.map(Math.log);
  const lo = STEAM.p[0];
  const hi = STEAM.p[STEAM.p.length - 1];
  if (!(pBar >= lo && pBar <= hi)) throw new RangeError(`Vapor saturado: de ${lo} a ${hi} bar abs.`);
  const x = Math.log(pBar);
  // la rejilla en ln p no es uniforme: Lagrange de 4 puntos con nodos reales
  let i0 = lp.findIndex((v) => v > x) - 2;
  if (i0 < 0) i0 = 0;
  i0 = Math.min(i0, lp.length - 4);
  const at = (ys, tf = (v) => v, inv = (v) => v) => {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      let w = 1;
      for (let j = 0; j < 4; j++) if (j !== i) w *= (x - lp[i0 + j]) / (lp[i0 + i] - lp[i0 + j]);
      s += w * tf(ys[i0 + i]);
    }
    return inv(s);
  };
  return { T: at(STEAM.T), rhoV: at(STEAM.rhoV, Math.log, Math.exp), rhoL: at(STEAM.rhoL) };
}
