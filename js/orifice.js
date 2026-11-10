// Placa orificio según ISO 5167-1/-2:2003.
// Módulo puro (sin DOM) para poder testearlo con `node --test`.
//
// Unidades SI en toda la API: m, Pa (absoluta cuando se indica p1), kg/m³, Pa·s, kg/s, K.
// Ecuaciones:
//   qm = C / √(1−β⁴) · ε · π/4 · d² · √(2·ΔP·ρ1)                      ISO 5167-1 (1)
//   C  = Reader-Harris/Gallagher                                       ISO 5167-2 (4)
//   ε  = 1 − (0,351 + 0,256β⁴ + 0,93β⁸)·[1 − (p2/p1)^(1/κ)]            ISO 5167-2 (5)
//   Δϖ = (√(1−β⁴(1−C²)) − Cβ²) / (√(1−β⁴(1−C²)) + Cβ²) · ΔP           ISO 5167-2 (7)

export const R_GAS = 8.314462618; // J/(mol·K)
export const P_STD = 101325; // Pa
export const T_NORMAL = 273.15; // K (Nm³: 0 °C, 1 atm)
export const T_STANDARD = 288.15; // K (Sm³: 15 °C, 1 atm)

export const TAPS = {
  corner: 'Esquina (corner taps)',
  flange: 'Brida (flange taps)',
  dd2: 'D y D/2',
};

function tapLengths(taps, Dmm) {
  switch (taps) {
    case 'corner': return { L1: 0, L2: 0 };
    case 'flange': return { L1: 25.4 / Dmm, L2: 25.4 / Dmm };
    case 'dd2': return { L1: 1, L2: 0.47 };
    default: throw new Error(`Tipo de tomas desconocido: ${taps}`);
  }
}

/**
 * Coeficiente de descarga C (Reader-Harris/Gallagher, ISO 5167-2:2003 ec. 4),
 * incluido el término adicional para D < 71,12 mm.
 * @param {number} beta  d/D
 * @param {number} ReD   número de Reynolds referido a D
 * @param {number} Dmm   diámetro interno de la tubería en mm
 * @param {'corner'|'flange'|'dd2'} taps
 */
export function dischargeCoefficient(beta, ReD, Dmm, taps) {
  const { L1, L2 } = tapLengths(taps, Dmm);
  const A = (19000 * beta / ReD) ** 0.8;
  const M2 = (2 * L2) / (1 - beta);
  const b4 = beta ** 4;
  let C = 0.5961 + 0.0261 * beta ** 2 - 0.216 * beta ** 8
    + 0.000521 * ((1e6 * beta) / ReD) ** 0.7
    + (0.0188 + 0.0063 * A) * beta ** 3.5 * (1e6 / ReD) ** 0.3
    + (0.043 + 0.080 * Math.exp(-10 * L1) - 0.123 * Math.exp(-7 * L1)) * (1 - 0.11 * A) * (b4 / (1 - b4))
    - 0.031 * (M2 - 0.8 * M2 ** 1.1) * beta ** 1.3;
  if (Dmm < 71.12) C += 0.011 * (0.75 - beta) * (2.8 - Dmm / 25.4);
  return C;
}

/**
 * Factor de expansibilidad ε (ISO 5167-2:2003 ec. 5). Para líquidos ε = 1.
 * @param {number} beta
 * @param {number} dp     presión diferencial (Pa)
 * @param {number} p1     presión absoluta aguas arriba (Pa)
 * @param {number} kappa  exponente isentrópico
 */
export function expansibility(beta, dp, p1, kappa) {
  if (!(p1 > 0) || !(kappa > 0)) throw new RangeError('p1 y κ deben ser positivos');
  const ratio = (p1 - dp) / p1;
  if (ratio <= 0) throw new RangeError('ΔP no puede ser mayor que p1');
  return 1 - (0.351 + 0.256 * beta ** 4 + 0.93 * beta ** 8) * (1 - ratio ** (1 / kappa));
}

/** Pérdida de presión permanente (ISO 5167-2:2003 ec. 7), en Pa. */
export function permanentLoss(beta, C, dp) {
  const s = Math.sqrt(1 - beta ** 4 * (1 - C * C));
  const cb = C * beta * beta;
  return ((s - cb) / (s + cb)) * dp;
}

/** Densidad de un gas real: ρ = p·M / (Z·R·T). p en Pa abs, T en K, M en kg/mol. */
export function gasDensity(p, T, M, Z = 1) {
  return (p * M) / (Z * R_GAS * T);
}

/** Densidad de mezcla crudo + agua sin deslizamiento. bsw en fracción (0–1). */
export function mixtureDensity(bsw, rhoOil, rhoWater) {
  return bsw * rhoWater + (1 - bsw) * rhoOil;
}

function checkPositive(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!(Number.isFinite(v) && v > 0)) throw new RangeError(`${k} debe ser un número positivo`);
  }
}

/**
 * Caudal a partir de la geometría y el ΔP (problema directo). C se itera con ReD.
 * @param {object} o
 * @param {number} o.D    diámetro interno de la tubería (m)
 * @param {number} o.d    diámetro del orificio (m)
 * @param {number} o.dp   presión diferencial (Pa)
 * @param {number} o.rho  densidad aguas arriba (kg/m³)
 * @param {number} o.mu   viscosidad dinámica (Pa·s)
 * @param {string} o.taps 'corner' | 'flange' | 'dd2'
 * @param {number} [o.p1]    presión absoluta aguas arriba (Pa). Solo gases.
 * @param {number} [o.kappa] exponente isentrópico. Solo gases.
 * @param {number} [o.C]     coeficiente fijo (hoja de datos). Si no se da, se calcula con RHG.
 */
export function orificeFlow({ D, d, dp, rho, mu, taps, p1, kappa, C: Cfixed }) {
  checkPositive({ D, d, dp, rho, mu });
  if (d >= D) throw new RangeError('d debe ser menor que D');
  const beta = d / D;
  const b4 = beta ** 4;
  const E = 1 / Math.sqrt(1 - b4);
  const isGas = p1 !== undefined || kappa !== undefined;
  const eps = isGas ? expansibility(beta, dp, p1, kappa) : 1;
  const k = E * eps * (Math.PI / 4) * d * d * Math.sqrt(2 * dp * rho);
  const Dmm = D * 1000;

  let C = Cfixed ?? 0.6;
  let iterations = 0;
  let converged = Cfixed !== undefined;
  if (!converged) {
    for (; iterations < 100; iterations++) {
      const ReD = (4 * C * k) / (Math.PI * mu * D);
      const Cn = dischargeCoefficient(beta, ReD, Dmm, taps);
      if (!Number.isFinite(Cn)) break;
      const delta = Math.abs(Cn - C);
      C = Cn;
      if (delta < 1e-12) { converged = true; break; }
    }
  }
  const qm = C * k;
  const ReD = (4 * qm) / (Math.PI * mu * D);
  const qv = qm / rho;
  return {
    beta, C, eps, E, qm, qv, ReD,
    loss: permanentLoss(beta, C, dp),
    velocity: qv / ((Math.PI / 4) * D * D),
    iterations, converged,
  };
}

/**
 * Dimensionamiento: diámetro de orificio d que produce `dp` al caudal másico `qm`.
 * ReD no depende de d, así que se resuelve β por bisección sobre
 * C(β)·ε(β)·β²/√(1−β⁴) = 4·qm / (π·D²·√(2·ΔP·ρ1)).
 */
export function sizeOrifice({ D, qm, dp, rho, mu, taps, p1, kappa }) {
  checkPositive({ D, qm, dp, rho, mu });
  const isGas = p1 !== undefined || kappa !== undefined;
  if (isGas) expansibility(0.5, dp, p1, kappa); // valida p1/κ/ΔP
  const ReD = (4 * qm) / (Math.PI * mu * D);
  const Dmm = D * 1000;
  const target = (4 * qm) / (Math.PI * D * D * Math.sqrt(2 * dp * rho));
  const f = (beta) => {
    const eps = isGas ? expansibility(beta, dp, p1, kappa) : 1;
    return dischargeCoefficient(beta, ReD, Dmm, taps) * eps * beta * beta / Math.sqrt(1 - beta ** 4) - target;
  };
  let lo = 0.02;
  let hi = 0.9;
  if (f(lo) > 0) throw new RangeError('El caudal es demasiado bajo para ese ΔP: β < 0,02. Baja el ΔP de diseño o reduce D.');
  if (f(hi) < 0) throw new RangeError('El caudal es demasiado alto para ese ΔP: β > 0,9. Sube el ΔP de diseño o aumenta D.');
  for (let i = 0; i < 200 && hi - lo > 1e-13; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  const beta = (lo + hi) / 2;
  const d = beta * D;
  const C = dischargeCoefficient(beta, ReD, Dmm, taps);
  const eps = isGas ? expansibility(beta, dp, p1, kappa) : 1;
  return { d, beta, C, eps, ReD, loss: permanentLoss(beta, C, dp), velocity: qm / rho / ((Math.PI / 4) * D * D) };
}

/** ReD mínimo de validez de RHG (ISO 5167-2:2003 5.3.1). */
export function minReynolds(beta, Dmm, taps) {
  if (taps === 'flange') return Math.max(5000, 170 * beta * beta * Dmm);
  return beta <= 0.56 ? 5000 : 16000 * beta * beta;
}

/**
 * Incertidumbre relativa de C en % (ISO 5167-2:2003 5.3.3.1), k = 2 aprox. (95 %).
 * Devuelve NaN fuera de 0,1 ≤ β ≤ 0,75.
 */
export function uncertaintyC(beta, Dmm, ReD) {
  let u;
  if (beta < 0.1 || beta > 0.75) return NaN;
  if (beta < 0.2) u = 0.7 - beta;
  else if (beta <= 0.6) u = 0.5;
  else u = 1.667 * beta - 0.5;
  if (Dmm < 71.12) u += 0.9 * (0.75 - beta) * (2.8 - Dmm / 25.4);
  if (beta > 0.5 && ReD < 10000) u += 0.2;
  return u;
}

/** Incertidumbre relativa de ε en % (ISO 5167-2:2003 5.3.3.2): 3,5·ΔP/(κ·p1). */
export function uncertaintyEps(dp, p1, kappa) {
  return (3.5 * dp) / (kappa * p1);
}

/**
 * Comprueba los límites de uso de ISO 5167-2:2003 (5.3.1) y otras buenas prácticas.
 * @returns {{level: 'warn'|'bad', text: string}[]}
 */
export function validityChecks({ D, d, ReD, taps, dp, p1, Cfixed = false }) {
  const out = [];
  const Dmm = D * 1000;
  const dmm = d * 1000;
  const beta = d / D;
  const n = (x, dec) => x.toFixed(dec).replace('.', ',');
  if (dmm < 12.5) out.push({ level: 'warn', text: `d = ${n(dmm, 2)} mm < 12,5 mm: fuera de ISO 5167-2.` });
  if (Dmm < 50 || Dmm > 1000) out.push({ level: 'warn', text: `D = ${n(Dmm, 1)} mm fuera de 50–1000 mm: fuera de ISO 5167-2.` });
  if (beta < 0.1 || beta > 0.75) out.push({ level: 'warn', text: `β = ${n(beta, 3)} fuera de 0,10–0,75: C no está validado.` });
  const reMin = minReynolds(beta, Dmm, taps);
  if (!Cfixed && ReD < reMin) {
    out.push({
      level: 'bad',
      text: `Re_D = ${Math.round(ReD)} por debajo del mínimo de la norma (${Math.round(reMin)}). ` +
        'El C calculado no es fiable: hace falta un C calibrado o revisar la viscosidad.',
    });
  }
  if (p1 !== undefined) {
    const ratio = (p1 - dp) / p1;
    if (ratio < 0.75) out.push({ level: 'bad', text: `p2/p1 = ${n(ratio, 3)} < 0,75: fuera del rango de validez de ε.` });
  }
  return out;
}

/**
 * Caudal a partir del rango de diseño (Qmax a ΔPmax), corregido por densidad.
 * Supone C y ε constantes. Para líquidos el factor es √(ρdiseño/ρreal) sobre el caudal volumétrico.
 * @returns {{q: number, qRaw: number, frac: number, dpFrac: number, K: number, cut: boolean}}
 */
export function flowFromRange({ qmax, dpmax, dp, rhoDesign, rhoActual, cutoff = 0 }) {
  checkPositive({ qmax, dpmax, rhoDesign, rhoActual });
  const dpFrac = Math.max(0, dp) / dpmax;
  const frac = Math.sqrt(dpFrac);
  const K = Math.sqrt(rhoDesign / rhoActual);
  const qRaw = qmax * frac;
  const cut = frac < cutoff;
  return { q: cut ? 0 : qRaw * K, qRaw, frac, dpFrac, K, cut };
}
