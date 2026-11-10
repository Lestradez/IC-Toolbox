// Nivel con transmisor de presión diferencial: LRV y URV con supresión o elevación de cero.
// Módulo puro (sin DOM) para poder testearlo con `node --test`.
//
// Modelo (ΔP = presión en el lado HP − presión en el lado LP, ambas en el transmisor):
//
//   ΔP(nivel) = g · [ ρ · (nivel − toma) + ρHP · caída − ρLP · alturaLP ]
//
//   ρ          densidad del líquido del tanque
//   nivel−toma altura de líquido sobre la toma HP
//   ρHP·caída  columna de la línea de impulso o capilar HP: «caída» = toma HP − transmisor
//              (positiva si el transmisor está por debajo de la toma). Suma al lado HP.
//   ρLP·altLP  columna de la pierna LP (húmeda o capilar): «alturaLP» = toma LP − transmisor.
//              Resta, porque está en el lado LP.
//
// Con ΔP(0 %) > 0 el cero está suprimido; con ΔP(0 %) < 0 está elevado.
// Todo en SI: m, kg/m³ y Pa.

/** Gravedad estándar (CGPM 1901), la misma del conversor de unidades. */
export const G0 = 9.80665;

/** Densidad del agua con que se define la densidad relativa (SG), coherente con las columnas de agua del conversor. */
export const RHO_WATER = 1000;

/** Unidades de densidad: factor a kg/m³. */
export const DENSITY_UNITS = {
  'kg/m3': { label: 'kg/m³', factor: 1 },
  'g/cm3': { label: 'g/cm³', factor: 1000 },
  SG: { label: 'SG (agua = 1)', factor: RHO_WATER },
  'lb/ft3': { label: 'lb/ft³', factor: 16.01846337396014 },
};

/** Densidad en kg/m³ desde su unidad. */
export function densityToKgM3(value, unit) {
  const u = DENSITY_UNITS[unit];
  if (!u) throw new Error(`Unidad de densidad desconocida: ${unit}`);
  return value * u.factor;
}

/**
 * Tipos de instalación. `leg` dice qué datos necesita cada una:
 *   fillHP  el lado HP lleva un relleno propio (capilar) en lugar del líquido del proceso
 *   ref     pierna LP húmeda con su propia densidad
 *   taps    hace falta la distancia entre tomas (tanque cerrado)
 *   offset  se pide el transmisor por debajo (+) o por encima (−) de la toma HP
 */
export const CONFIGS = {
  open: {
    label: 'Tanque abierto (LP al aire)',
    hint: 'Línea de impulso HP llena del líquido del proceso. LP a la atmósfera.',
    offset: true,
  },
  'open-seal': {
    label: 'Tanque abierto con sello remoto',
    hint: 'Un sello con capilar en la toma HP; LP a la atmósfera.',
    fillHP: true,
    offset: true,
  },
  dry: {
    label: 'Tanque cerrado, pierna seca',
    hint: 'La pierna LP lleva gas seco: su peso se desprecia.',
    taps: true,
    offset: true,
  },
  wet: {
    label: 'Tanque cerrado, pierna húmeda',
    hint: 'La pierna LP está llena de un líquido de referencia desde la toma superior.',
    ref: true,
    taps: true,
    offset: true,
  },
  seals: {
    label: 'Tanque cerrado, dos sellos remotos',
    hint: 'Capilares con el mismo relleno en HP y LP. La altura del transmisor se anula si los capilares son iguales y están a la misma temperatura.',
    fillHP: true,
    taps: true,
  },
};

/**
 * ΔP (Pa) para un nivel dado. Ver el modelo arriba.
 * @param {object} o
 * @param {number} o.level    nivel (m), en el mismo origen que `tap`
 * @param {number} o.tap      cota de la toma HP (m)
 * @param {number} o.rho      densidad del líquido del proceso (kg/m³)
 * @param {number} [o.rhoHP]  densidad del relleno HP (kg/m³); por defecto, la del proceso
 * @param {number} [o.drop]   toma HP − transmisor (m)
 * @param {number} [o.rhoLP]  densidad de la pierna LP (kg/m³)
 * @param {number} [o.headLP] toma LP − transmisor (m)
 */
export function levelDP({ level, tap, rho, rhoHP = rho, drop = 0, rhoLP = 0, headLP = 0 }) {
  return G0 * (rho * (level - tap) + rhoHP * drop - rhoLP * headLP);
}

const positive = (x) => Number.isFinite(x) && x > 0;

/**
 * Rango de calibración (LRV, URV) de un transmisor de nivel por ΔP.
 *
 * @param {object} o
 * @param {string} o.config       clave de CONFIGS
 * @param {number} o.lo           nivel al 0 % (m)
 * @param {number} o.hi           nivel al 100 % (m)
 * @param {number} o.tap          cota de la toma HP (m), en el mismo origen que lo y hi
 * @param {number} o.rho          densidad del líquido (kg/m³)
 * @param {number} [o.offset=0]   transmisor por debajo (+) o por encima (−) de la toma HP (m)
 * @param {number} [o.taps]       distancia entre tomas HP y LP (m), tanques cerrados
 * @param {number} [o.rhoFill]    densidad del relleno del capilar (kg/m³)
 * @param {number} [o.rhoRef]     densidad de la pierna húmeda (kg/m³)
 * @returns {{lrv:number, urv:number, span:number, kind:'suppressed'|'elevated'|'none',
 *   dp:(level:number)=>number, at:(pct:number)=>{level:number, dp:number}}}  presiones en Pa
 * @throws {RangeError} si faltan datos o son físicamente imposibles
 */
export function levelRange({ config, lo, hi, tap, rho, offset = 0, taps, rhoFill, rhoRef }) {
  const c = CONFIGS[config];
  if (!c) throw new RangeError('Tipo de instalación desconocido.');
  for (const [name, v] of [['0 %', lo], ['100 %', hi], ['toma HP', tap]]) {
    if (!Number.isFinite(v)) throw new RangeError(`Falta el nivel de ${name}.`);
  }
  if (!positive(rho)) throw new RangeError('La densidad del líquido debe ser mayor que 0.');
  if (!(hi > lo)) throw new RangeError('El 100 % debe quedar por encima del 0 %.');
  if (lo < tap) {
    throw new RangeError('El 0 % queda por debajo de la toma HP: el transmisor no mide por debajo de ella. Sube el 0 % a la cota de la toma o más.');
  }
  if (c.fillHP && !positive(rhoFill)) throw new RangeError('Falta la densidad del relleno del capilar.');
  if (c.ref && !positive(rhoRef)) throw new RangeError('Falta la densidad de la pierna húmeda.');
  if (c.taps && !positive(taps)) throw new RangeError('Falta la distancia entre tomas (mayor que 0).');
  if (c.taps && hi - tap > taps) {
    throw new RangeError('El 100 % queda por encima de la toma LP: el tanque se inundaría la pierna LP. Revisa la distancia entre tomas.');
  }
  const off = c.offset ? offset : 0;
  if (!Number.isFinite(off)) throw new RangeError('Altura del transmisor no válida.');

  const p = { tap, rho };
  if (c.fillHP) p.rhoHP = rhoFill;
  if (config === 'seals') {
    // Mismo relleno en los dos capilares: la cota del transmisor se anula.
    p.rhoHP = rhoFill;
    p.rhoLP = rhoFill;
    p.headLP = taps;
  } else {
    p.drop = off;
    if (config === 'wet') {
      p.rhoLP = rhoRef;
      p.headLP = taps + off;
    }
  }

  const dp = (level) => levelDP({ ...p, level });
  const lrv = dp(lo);
  const urv = dp(hi);
  const span = urv - lrv;
  const eps = 1e-9 * Math.max(1, Math.abs(lrv), Math.abs(urv));
  const kind = Math.abs(lrv) <= eps ? 'none' : lrv > 0 ? 'suppressed' : 'elevated';
  return {
    lrv,
    urv,
    span,
    kind,
    dp,
    at: (pct) => {
      const level = lo + ((hi - lo) * pct) / 100;
      return { level, dp: dp(level) };
    },
  };
}

/**
 * Rango de un transmisor de nivel dado el tanque como se mide en planta.
 *
 * La cota 0 es la referencia física del tanque (suelo, o el aro donde termina un fondo cónico) y
 * la cota superior es el aro del techo. El transmisor mide de la toma HP hasta la cota superior:
 * 0 % del lazo = toma, 100 % = cota superior. Lo que queda por debajo de la toma es zona muerta.
 *
 * @param {object} o
 * @param {string} o.config       clave de CONFIGS
 * @param {number} o.top          cota superior del tanque (m, desde la referencia 0)
 * @param {number} o.tap          cota de la toma HP o de la brida del sello (m)
 * @param {number} [o.xmtr]       cota del transmisor (m); por defecto, la de la toma (montaje en brida)
 * @param {number} [o.lpTap]      cota de la toma LP (m), tanques cerrados; por defecto, la cota superior
 * @param {number} o.rho          densidad del líquido (kg/m³)
 * @param {number} [o.rhoFill]    densidad del relleno del capilar (kg/m³)
 * @param {number} [o.rhoRef]     densidad de la pierna húmeda (kg/m³)
 * @returns rango en Pa (ver levelRange) más: `column` (LRV y URV como m de líquido), `plc`
 *   (escalado de ingeniería: 0 % = tap, 100 % = top, y la forma «0..alto + offset»), `deadZone`
 *   (m y % de la altura del tanque bajo la toma) y `tapPct`/`xmtrPct`/`lpPct` (% de la altura del tanque).
 * @throws {RangeError}
 */
export function tankRange({ config, top, tap, xmtr, lpTap, rho, rhoFill, rhoRef }) {
  const c = CONFIGS[config];
  if (!c) throw new RangeError('Tipo de instalación desconocido.');
  if (!Number.isFinite(top) || !(top > 0)) throw new RangeError('La cota superior debe ser mayor que 0 (se mide desde la referencia 0).');
  if (!Number.isFinite(tap) || tap < 0) throw new RangeError('La cota de la toma debe ser 0 o más: no puede quedar por debajo de la referencia.');
  if (!(tap < top)) throw new RangeError('La toma HP debe quedar por debajo de la cota superior.');
  const x = xmtr === undefined || Number.isNaN(xmtr) ? tap : xmtr;
  if (!Number.isFinite(x)) throw new RangeError('Cota del transmisor no válida.');
  const lp = lpTap === undefined || Number.isNaN(lpTap) ? top : lpTap;
  const r = levelRange({
    config, lo: tap, hi: top, tap, rho,
    offset: tap - x,
    taps: c.taps ? lp - tap : undefined,
    rhoFill, rhoRef,
  });
  const rg = G0 * rho;
  const height = top - tap;
  return {
    ...r,
    height,
    column: { lrv: r.lrv / rg, urv: r.urv / rg },
    plc: { lo: tap, hi: top, span: height, offset: tap },
    deadZone: { height: tap, pct: (tap / top) * 100 },
    tapPct: (tap / top) * 100,
    xmtrPct: (x / top) * 100,
    lpPct: c.taps ? (lp / top) * 100 : undefined,
    xmtr: x,
    lpTap: c.taps ? lp : undefined,
  };
}
