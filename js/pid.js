// Sintonía de lazos PID: identificación del proceso desde una prueba de escalón, reglas de
// sintonía, robustez (Ms, márgenes), simulación del lazo cerrado y conversión a la forma y las
// unidades de cada controlador. Sin DOM.
//
// Convenciones internas:
// - Tiempos en segundos.
// - Ganancia del proceso K en % de span de PV por % de span de CV (autorregulado, adimensional)
//   o en (% PV / s) por % CV (integrador, 1/s). Así la ganancia del controlador Kc sale en %/%.
// - Los parámetros de sintonía se expresan en la forma ideal (ISA, «dependiente»):
//     CV = Kc · [ e + (1/Ti)·∫e dt + Td · de/dt ]
//   Ti = Infinity significa sin acción integral; Td = 0, sin derivativa.

/** Tipos de proceso. */
export const PROCESS = {
  self: 'Autorregulado',
  integ: 'Integrador (nivel)',
};

// ---------------------------------------------------------------------------
// Identificación
// ---------------------------------------------------------------------------

/** Niveles de PV en los que leer los tiempos t28 y t63 de la curva de reacción. */
export function stepLevels(pv0, pv1) {
  const d = pv1 - pv0;
  return { p28: pv0 + 0.283 * d, p63: pv0 + 0.632 * d };
}

/**
 * Proceso autorregulado (FOPDT) desde un escalón de CV en manual.
 * Tiempos medidos desde el instante del escalón (s).
 * method 'smith': dos puntos, t28 y t63 (Smith, 1972): τ = 1,5·(t63 − t28), θ = t63 − τ.
 * method 't63': inicio de la respuesta y t63: θ = tStart, τ = t63 − tStart.
 * Devuelve { K, tau, theta, warnings } con K en %/% (con signo).
 */
export function identifySelf({ pv0, pv1, cv0, cv1, pvSpan, cvSpan, method = 'smith', t28, t63, tStart }) {
  const dPV = (pv1 - pv0) / pvSpan;
  const dCV = (cv1 - cv0) / cvSpan;
  if (!(pvSpan > 0) || !(cvSpan > 0)) throw new Error('Los spans de PV y CV deben ser > 0.');
  if (dCV === 0) throw new Error('El escalón de CV no puede ser 0.');
  if (dPV === 0) throw new Error('La PV no cambió: no hay respuesta que identificar.');
  const K = dPV / dCV;
  const warnings = [];
  let tau;
  let theta;
  if (method === 'smith') {
    if (!(t28 >= 0) || !(t63 > t28)) throw new Error('Hace falta 0 ≤ t28 < t63.');
    tau = 1.5 * (t63 - t28);
    theta = t63 - tau;
  } else {
    if (!(tStart >= 0) || !(t63 > tStart)) throw new Error('Hace falta 0 ≤ inicio < t63.');
    theta = tStart;
    tau = t63 - tStart;
  }
  if (theta < 0) {
    warnings.push('neg-theta');
    theta = 0;
  }
  if (Math.abs(dCV) < 0.03) warnings.push('small-step');
  return { K, tau, theta, warnings };
}

/**
 * Proceso integrador desde un escalón de CV: pendientes de PV antes y después (unidades de PV
 * por segundo) y tiempo muerto (inicio del cambio de pendiente, s).
 * K = Δpendiente(%/s) / ΔCV(%), en 1/s.
 */
export function identifyInteg({ slope0 = 0, slope1, cv0, cv1, pvSpan, cvSpan, tStart }) {
  if (!(pvSpan > 0) || !(cvSpan > 0)) throw new Error('Los spans de PV y CV deben ser > 0.');
  const dCV = (cv1 - cv0) / cvSpan;
  if (dCV === 0) throw new Error('El escalón de CV no puede ser 0.');
  const dSlope = (slope1 - slope0) / pvSpan;
  if (dSlope === 0) throw new Error('La pendiente no cambió: no hay respuesta que identificar.');
  if (!(tStart >= 0)) throw new Error('El tiempo muerto debe ser ≥ 0.');
  const warnings = [];
  if (Math.abs(dCV) < 0.03) warnings.push('small-step');
  return { K: dSlope / dCV, theta: tStart, warnings };
}

// ---------------------------------------------------------------------------
// Reglas de sintonía
// ---------------------------------------------------------------------------

/** Reglas sobre el modelo (K, τ, θ). `self`/`integ`: tipos de proceso admitidos. */
export const RULES = {
  lambda: { label: 'Lambda / IMC', self: true, integ: true, types: ['PI', 'PID'], integTypes: ['PI'] },
  simc: { label: 'SIMC (Skogestad)', self: true, integ: true, types: ['PI'] },
  zn: { label: 'Ziegler-Nichols (curva de reacción)', self: true, integ: true, types: ['P', 'PI', 'PID'] },
  cc: { label: 'Cohen-Coon', self: true, integ: false, types: ['P', 'PI', 'PID'] },
};

/** Reglas sobre la ganancia y el periodo últimos (ensayo de ciclo sostenido). */
export const ULTIMATE_RULES = {
  zn: { label: 'Ziegler-Nichols (ciclo sostenido)', types: ['P', 'PI', 'PID'] },
  tl: { label: 'Tyreus-Luyben', types: ['PI', 'PID'] },
};

/** Tipos de controlador (P, PI, PID) que da una regla para un tipo de proceso. */
export function ruleTypes(rule, kind) {
  const r = RULES[rule];
  if (!r || !r[kind]) return [];
  return (kind === 'integ' && r.integTypes) || r.types;
}

/** λ (o τc) por defecto. Autorregulado: max(τ, 3θ). Integrador: 3θ. SIMC: τc = θ. */
export function defaultLambda(rule, model) {
  if (rule === 'simc') return model.theta;
  return model.kind === 'integ' ? 3 * model.theta : Math.max(model.tau, 3 * model.theta);
}

const P_ONLY = (Kc) => ({ Kc, Ti: Infinity, Td: 0 });

/**
 * Sintonía por regla. model = { kind: 'self'|'integ', K, tau, theta }.
 * Devuelve { Kc, Ti, Td, lambda? } en forma ideal, con Kc ≥ 0 (la acción va aparte, según el
 * signo de K), o null si la regla no tiene versión para ese caso.
 */
export function tune(rule, type, model, lambda) {
  const r = RULES[rule];
  if (!r || !r[model.kind] || !ruleTypes(rule, model.kind).includes(type)) return null;
  const K = Math.abs(model.K);
  const { theta } = model;
  const tau = model.tau;
  if (!(K > 0) || !(theta >= 0) || (model.kind === 'self' && !(tau > 0))) return null;
  const lam = lambda ?? defaultLambda(rule, model);

  if (rule === 'lambda') {
    if (!(lam > 0)) return null;
    if (model.kind === 'self') {
      if (type === 'PI') return { Kc: tau / (K * (lam + theta)), Ti: tau, Td: 0, lambda: lam };
      // IMC con Padé de primer orden (Rivera, Morari y Skogestad, 1986), forma ideal.
      return {
        Kc: (2 * tau + theta) / (K * (2 * lam + theta)),
        Ti: tau + theta / 2,
        Td: (tau * theta) / (2 * tau + theta),
        lambda: lam,
      };
    }
    // Integrador: Ti = 2λ + θ, Kc = Ti / (K·(λ + θ)²).
    // En nivel la derivativa casi nunca aporta (PV ruidosa): solo PI.
    if (type !== 'PI') return null;
    const Ti = 2 * lam + theta;
    return { Kc: Ti / (K * (lam + theta) ** 2), Ti, Td: 0, lambda: lam };
  }

  if (rule === 'simc') {
    if (!(lam >= 0) || lam + theta <= 0) return null;
    if (model.kind === 'self') {
      return { Kc: tau / (K * (lam + theta)), Ti: Math.min(tau, 4 * (lam + theta)), Td: 0, lambda: lam };
    }
    return { Kc: 1 / (K * (lam + theta)), Ti: 4 * (lam + theta), Td: 0, lambda: lam };
  }

  if (!(theta > 0)) return null; // ZN y Cohen-Coon dividen por θ
  if (rule === 'zn') {
    // a = K·θ/τ (autorregulado) o K·θ (integrador)
    const a = model.kind === 'self' ? (K * theta) / tau : K * theta;
    if (type === 'P') return P_ONLY(1 / a);
    if (type === 'PI') return { Kc: 0.9 / a, Ti: theta / 0.3, Td: 0 };
    return { Kc: 1.2 / a, Ti: 2 * theta, Td: 0.5 * theta };
  }

  // Cohen-Coon (1953), con r = θ/τ.
  const r0 = theta / tau;
  const base = tau / (K * theta);
  if (type === 'P') return P_ONLY(base * (1 + r0 / 3));
  if (type === 'PI') return { Kc: base * (0.9 + r0 / 12), Ti: (theta * (30 + 3 * r0)) / (9 + 20 * r0), Td: 0 };
  return { Kc: base * (4 / 3 + r0 / 4), Ti: (theta * (32 + 6 * r0)) / (13 + 8 * r0), Td: (4 * theta) / (11 + 2 * r0) };
}

/** Sintonía desde la ganancia última Ku (%/%) y el periodo último Pu (s). */
export function tuneUltimate(rule, type, Ku, Pu) {
  if (!(Ku > 0) || !(Pu > 0) || !ULTIMATE_RULES[rule]?.types.includes(type)) return null;
  if (rule === 'zn') {
    if (type === 'P') return P_ONLY(0.5 * Ku);
    if (type === 'PI') return { Kc: 0.45 * Ku, Ti: Pu / 1.2, Td: 0 };
    return { Kc: 0.6 * Ku, Ti: Pu / 2, Td: Pu / 8 };
  }
  if (type === 'PI') return { Kc: Ku / 3.2, Ti: 2.2 * Pu, Td: 0 };
  return { Kc: Ku / 2.2, Ti: 2.2 * Pu, Td: Pu / 6.3 };
}

// ---------------------------------------------------------------------------
// Formas del algoritmo
// ---------------------------------------------------------------------------

/** Serie (interactiva) → ideal. */
export function seriesToIdeal({ Kc, Ti, Td }) {
  if (!Number.isFinite(Ti)) return { Kc, Ti, Td };
  const f = 1 + Td / Ti;
  return { Kc: Kc * f, Ti: Ti * f, Td: Td / f };
}

/** Ideal → serie. null si Ti < 4·Td (no hay equivalente en serie). */
export function idealToSeries({ Kc, Ti, Td }) {
  if (!Number.isFinite(Ti) || Td === 0) return { Kc, Ti, Td };
  const disc = 1 - (4 * Td) / Ti;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  return { Kc: (Kc / 2) * (1 + s), Ti: (Ti / 2) * (1 + s), Td: (Ti / 2) * (1 - s) };
}

/** Ideal → paralelo (independiente): Kp = Kc, Ki = Kc/Ti (1/s), Kd = Kc·Td (s). */
export function idealToParallel({ Kc, Ti, Td }) {
  return { Kp: Kc, Ki: Number.isFinite(Ti) ? Kc / Ti : 0, Kd: Kc * Td };
}

// ---------------------------------------------------------------------------
// Controladores
// ---------------------------------------------------------------------------

/**
 * Controladores de destino. `confidence`: 'cierto' (verificado en la documentación del fabricante),
 * 'probable' (deducido de documentación incompleta o de la familia anterior) o 'suposicion'.
 * `eu`: true si la ganancia se aplica en unidades de ingeniería (no en % de span).
 * `params(p, ctx)` devuelve [[nombre, valor, unidad]] a partir de la forma ideal p (s).
 * ctx = { pvSpan, cvSpan } para convertir ganancias en unidades de ingeniería.
 */
export const CONTROLLERS = {
  'logix-pid-dep': {
    label: 'Logix PID · dependiente (ISA)',
    confidence: 'cierto',
    params: (p) => [
      ['.KP (Kc)', p.Kc, ''],
      ['.KI (Ti)', Number.isFinite(p.Ti) ? p.Ti / 60 : 0, 'min/repetición'],
      ['.KD (Td)', p.Td / 60, 'min'],
    ],
    setup: '.PE = 1 (dependiente). Acción: .CA = 0 → E = SP − PV; .CA = 1 → E = PV − SP. .KI = 0 anula la integral.',
    note: 'La ayuda no aclara si el error se calcula en % del span de MAXS/MINS o en unidades de PV: confírmalo con un escalón pequeño en automático antes de fiarte de Kc.',
    source: 'Studio 5000 Logix Designer v37, «PID Structure» y «Using PID Instructions» (Rockwell).',
  },
  'logix-pid-ind': {
    label: 'Logix PID · independiente',
    confidence: 'cierto',
    params: (p) => {
      const q = idealToParallel(p);
      return [['.KP', q.Kp, ''], ['.KI', q.Ki, '1/s'], ['.KD', q.Kd, 's']];
    },
    setup: '.PE = 0 (independiente). Acción: .CA = 0 → E = SP − PV; .CA = 1 → E = PV − SP.',
    note: 'Ojo: en la PID el .KI independiente va en 1/s, en la PIDE en 1/min. La misma duda sobre el % de span que en la forma dependiente.',
    source: 'Studio 5000 Logix Designer v37, «PID Structure» y «Using PID Instructions» (Rockwell).',
  },
  'logix-pide-dep': {
    label: 'Logix PIDE · dependiente (ISA)',
    confidence: 'cierto',
    params: (p) => [
      ['PGain (Kc)', p.Kc, ''],
      ['IGain (Ti)', Number.isFinite(p.Ti) ? p.Ti / 60 : 0, 'min/repetición'],
      ['DGain (Td)', p.Td / 60, 'min'],
    ],
    setup: 'DependIndepend = 1 (dependiente). Error en % de span: configura PVEUMax/Min y CVEUMax/Min con los rangos reales.',
    note: 'Revisa el sentido de la acción (ControlAction) en la ayuda de tu versión: no lo pude verificar.',
    source: 'Rockwell Logix-WP008B-EN-P (2016), «Perform Common Process Loop Control Algorithms Using the PIDE Instruction».',
  },
  'logix-pide-ind': {
    label: 'Logix PIDE · independiente',
    confidence: 'cierto',
    params: (p) => {
      const q = idealToParallel(p);
      return [['PGain', q.Kp, ''], ['IGain', q.Ki * 60, '1/min'], ['DGain', q.Kd / 60, 'min']];
    },
    setup: 'DependIndepend = 0 (independiente). Error en % de span: configura PVEUMax/Min y CVEUMax/Min.',
    note: 'Revisa el sentido de la acción (ControlAction) en la ayuda de tu versión: no lo pude verificar.',
    source: 'Rockwell Logix-WP008B-EN-P (2016).',
  },
  'micro800-pid': {
    label: 'Micro800 · instrucción PID (L20E/L50E/L70E)',
    confidence: 'probable',
    eu: true,
    params: (p, { pvSpan, cvSpan }) => [
      ['Gains.Kc', p.Kc * (cvSpan / pvSpan), 'u. CV / u. PV'],
      ['Gains.Ti', Number.isFinite(p.Ti) ? p.Ti : 0, 's'],
      ['Gains.Td', p.Td, 's'],
    ],
    setup: 'Control = FALSE: acción inversa (calentar); TRUE: directa (enfriar). Td = 0 → PI. FC: filtro, recomendado 0–20.',
    note: 'Ti y Td en segundos y Kc «del que dependen P e I» están en la ayuda; la ecuación y si Kc trabaja en unidades de ingeniería no. Supongo unidades de ingeniería (PV y SP en la misma unidad, CV entre CVMin y CVMax), por eso Kc se multiplica por span CV / span PV. Para P puro no hay forma de anular Ti (mínimo 0,0001 s): usa un Ti muy grande.',
    source: 'FactoryTalk Design Workbench, Micro800 «PID (proportional-integral-derivative)» (Rockwell).',
  },
  'micro800-ipid': {
    label: 'Micro800 · IPIDCONTROLLER (CCW)',
    confidence: 'suposicion',
    params: (p) => [
      ['ProportionalGain', p.Kc, ''],
      ['TimeIntegral', Number.isFinite(p.Ti) ? p.Ti : 0, 's'],
      ['TimeDerivative', p.Td, 's'],
    ],
    setup: 'DirectActing = TRUE para acción directa. DerivativeGain: filtro de la derivativa (suele dejarse en 0,1).',
    note: 'NO VERIFICADO: no pude leer el manual 2080-RM001. Algunas fuentes dicen que es paralelo y que el tiempo puede ir en minutos. Confirma la forma y las unidades en la ayuda de CCW antes de usar estos valores.',
    source: 'Sin fuente primaria.',
  },
  'm221-pid': {
    label: 'Modicon M221 · PID',
    confidence: 'probable',
    params: (p) => [
      ['Kp (× 0,01)', Math.round(p.Kc * 100), ''],
      ['Ti (× 0,1 s)', Number.isFinite(p.Ti) ? Math.round(p.Ti * 10) : 0, ''],
      ['Td (× 0,1 s)', Math.round(p.Td * 10), ''],
    ],
    limits: { Kp: [1, 10000], Ti: [0, 20000], Td: [0, 10000] },
    setup: 'Medida y salida en 0–10000, por eso Kp equivale a %/%. Ti = 0 cambia a otro algoritmo (no es «sin integral»). Td = 0 anula la derivativa. Kp = 0 no está permitido. Acción directa/inversa en la pestaña General.',
    note: 'El escalado Kp × 0,01 y Ti/Td × 0,1 s viene del PID de Twido, que el M221 hereda; la ayuda actual del bloque no lo dice en texto. Confirma en el PID Assistant.',
    source: 'Machine Expert Basic, «FB_PID: PID Function Block» (Schneider) y manual del PID de Twido.',
  },
  'm340-pidff': {
    label: 'Modicon M340 · PIDFF mixto',
    confidence: 'suposicion',
    params: (p) => [
      ['para.kp', p.Kc, ''],
      ['para.ti', Number.isFinite(p.Ti) ? p.Ti : 0, 's (TIME)'],
      ['para.td', p.Td, 's (TIME)'],
    ],
    setup: 'mix_par = mixta (ISA). pv_inf/pv_sup y out_inf/out_sup con los rangos reales: el PIDFF trabaja normalizado, así que kp es %/%. ti = 0 anula la integral; td = 0, la derivativa. rev_dir elige acción directa o inversa.',
    note: 'NO VERIFICADO: la ayuda de Schneider no deja leerse de forma automática. Esto sale de memoria del bloque PIDFF; confirma en la ayuda de Control Expert el valor de mix_par para «mixta», el sentido de rev_dir y que ti/td sean TIME en segundos.',
    source: 'Sin fuente primaria leída (Control Expert, Process Control Library, PIDFF).',
  },
  ideal: {
    label: 'Genérico · ideal / ISA',
    confidence: 'cierto',
    params: (p) => [['Kc', p.Kc, '%/%'], ['Ti', p.Ti, 's'], ['Td', p.Td, 's']],
  },
  series: {
    label: 'Genérico · serie / interactiva',
    confidence: 'cierto',
    params: (p) => {
      const q = idealToSeries(p);
      if (!q) return [['Kc′', NaN, ''], ['Ti′', NaN, 's'], ['Td′', NaN, 's']];
      return [['Kc′', q.Kc, '%/%'], ['Ti′', q.Ti, 's'], ['Td′', q.Td, 's']];
    },
    note: 'Si Ti < 4·Td no hay equivalente en serie: baja Td.',
  },
  parallel: {
    label: 'Genérico · paralelo',
    confidence: 'cierto',
    params: (p) => {
      const q = idealToParallel(p);
      return [['Kp', q.Kp, '%/%'], ['Ki', q.Ki, '1/s'], ['Kd', q.Kd, 's']];
    },
  },
};

/**
 * Acción del controlador según el signo de K: si la PV sube al subir la CV hace falta acción
 * inversa (e = SP − PV), y al revés.
 */
export const actionFor = (K) => (K > 0 ? 'reverse' : 'direct');

// ---------------------------------------------------------------------------
// Robustez: respuesta en frecuencia del lazo abierto
// ---------------------------------------------------------------------------

/** Filtro de la derivativa: Td·s / (1 + Td·s/N). */
export const DERIV_N = 10;

/**
 * Lazo abierto L(jω) = C(jω)·G(jω), con |K|. Devuelve { mag, phase } (phase en rad, continua).
 */
function loop(w, model, p) {
  const K = Math.abs(model.K);
  // Controlador ideal con filtro en la derivativa.
  const Ti = p.Ti;
  let re = 1;
  let im = Number.isFinite(Ti) ? -1 / (w * Ti) : 0;
  if (p.Td > 0) {
    const a = (w * p.Td) / DERIV_N;
    const d = 1 + a * a;
    re += (w * p.Td * a) / d;
    im += (w * p.Td) / d;
  }
  let mag = p.Kc * Math.hypot(re, im) * K;
  let phase = Math.atan2(im, re) - w * model.theta;
  if (model.kind === 'self') {
    mag /= Math.hypot(1, w * model.tau);
    phase -= Math.atan(w * model.tau);
  } else {
    mag /= w;
    phase -= Math.PI / 2;
  }
  return { mag, phase };
}

/**
 * Ms = max |1/(1+L)|, margen de ganancia (veces) y de fase (grados).
 * stable = false si en el primer cruce de −180° |L| ≥ 1.
 */
export function robustness(model, p) {
  const T = model.theta + (model.kind === 'self' ? model.tau : 0) + (Number.isFinite(p.Ti) ? p.Ti : 0) || 1;
  const wLo = 1e-4 / T;
  const wHi = 1e4 / T;
  const n = 4000;
  let Ms = 0;
  let gm = Infinity;
  let pm = Infinity;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const w = wLo * (wHi / wLo) ** (i / n);
    const L = loop(w, model, p);
    const re = 1 + L.mag * Math.cos(L.phase);
    const im = L.mag * Math.sin(L.phase);
    Ms = Math.max(Ms, 1 / Math.hypot(re, im));
    if (prev) {
      if (gm === Infinity && prev.phase > -Math.PI && L.phase <= -Math.PI) {
        const f = (prev.phase + Math.PI) / (prev.phase - L.phase);
        gm = 1 / (prev.mag + f * (L.mag - prev.mag));
      }
      if (pm === Infinity && prev.mag >= 1 && L.mag < 1) {
        const f = (prev.mag - 1) / (prev.mag - L.mag);
        pm = ((prev.phase + f * (L.phase - prev.phase)) * 180) / Math.PI + 180;
      }
    }
    prev = L;
  }
  const stable = gm > 1 && pm > 0;
  return { Ms: stable ? Ms : Infinity, gm, pm, stable };
}

/** Lectura de Ms: < 1,4 conservador, 1,4–1,7 equilibrado, 1,7–2 agresivo, > 2 poco robusto. */
export function msClass(Ms) {
  if (!Number.isFinite(Ms)) return 'unstable';
  if (Ms < 1.4) return 'conservative';
  if (Ms <= 1.7) return 'balanced';
  if (Ms <= 2) return 'aggressive';
  return 'fragile';
}

// ---------------------------------------------------------------------------
// Simulación del lazo cerrado
// ---------------------------------------------------------------------------

/**
 * Lazo cerrado lineal (sin límites de CV): escalón de consigna de 1 % en t = 0 y, a mitad de la
 * simulación, una perturbación de carga de −1 % en la entrada del proceso.
 * PID ideal con P sobre el error y D sobre la PV filtrada (N = 10), como la mayoría de los PLC.
 * Devuelve { t: [], pv: [], cv: [], tLoad, overshoot, iaeSp, iaeLoad }.
 */
export function simulate(model, p, { points = 400 } = {}) {
  const K = Math.abs(model.K);
  const { theta } = model;
  const tau = model.kind === 'self' ? model.tau : 0;
  const Ti = Number.isFinite(p.Ti) ? p.Ti : 0;
  let base = theta + Math.max(tau, Ti);
  if (!(base > 0)) base = 1 / (K * p.Kc);
  const tEnd = 12 * base;
  const tLoad = tEnd / 2;
  const steps = 4000;
  const dt = tEnd / steps;
  const delaySteps = Math.round(theta / dt);
  const buf = new Array(delaySteps + 1).fill(0);
  let head = 0;
  let x = 0; // PV (%)
  let integ = 0;
  let dFilt = 0; // derivativa filtrada de −PV
  let prevPv = 0;
  const Tf = p.Td > 0 ? p.Td / DERIV_N : 0;
  const out = { t: [], pv: [], cv: [], tLoad };
  const every = Math.max(1, Math.round(steps / points));
  let peak = 0;
  let iaeSp = 0;
  let iaeLoad = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const sp = 1;
    const e = sp - x;
    if (p.Td > 0) {
      const raw = -(x - prevPv) / dt;
      dFilt += (dt / (Tf + dt)) * (raw - dFilt);
    }
    prevPv = x;
    const cv = p.Kc * (e + (Ti ? integ / Ti : 0) + p.Td * dFilt);
    if (Ti) integ += e * dt;
    if (i % every === 0) {
      out.t.push(t);
      out.pv.push(x);
      out.cv.push(cv);
    }
    if (t < tLoad) {
      peak = Math.max(peak, x);
      iaeSp += Math.abs(e) * dt;
    } else {
      iaeLoad += Math.abs(e) * dt;
    }
    // proceso con tiempo muerto
    const u = cv + (t >= tLoad ? -1 : 0);
    buf[head] = u;
    head = (head + 1) % buf.length;
    const ud = buf[head];
    if (model.kind === 'self') x += (dt / tau) * (K * ud - x);
    else x += dt * K * ud;
    if (!Number.isFinite(x) || Math.abs(x) > 1e6) break;
  }
  out.overshoot = Math.max(0, peak - 1);
  out.iaeSp = iaeSp;
  out.iaeLoad = iaeLoad;
  return out;
}
