// Vista de la placa orificio. La lógica de cálculo vive en orifice.js (testeada).
import {
  orificeFlow, sizeOrifice, flowFromRange, validityChecks, uncertaintyC, uncertaintyEps,
  gasDensity, mixtureDensity, P_STD, T_NORMAL, T_STANDARD, TAPS,
} from '../../orifice.js';
import { PIPES, pipeID, schedules, matchSchedule } from '../../pipes.js';
import { QUANTITIES, convert, mAToPercent, namurStatus } from '../../units.js';
import { parseNum, fmt, fmtFixed, $ } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';
import { mountPicker } from '../densities/picker.js';

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Modo de cálculo">
    <button type="button" role="tab" data-mode="flow">Calcular caudal</button>
    <button type="button" role="tab" data-mode="size">Dimensionar d</button>
    <button type="button" role="tab" data-mode="range">Desde rango</button>
  </div>

  <div class="card" data-modes="flow size">
    <h2>Tubería y placa</h2>
    <label>Diámetro interno de la tubería
      <select id="o-Dmode">
        <option value="nps">NPS + schedule (ASME B36.10M)</option>
        <option value="man">D interno manual</option>
      </select>
    </label>
    <div class="row" id="o-npsBox">
      <label>NPS <select id="o-nps"></select></label>
      <label>Schedule <select id="o-sch"></select></label>
    </div>
    <label id="o-manBox">D interno
      <span class="combo"><input id="o-D" type="text" inputmode="decimal" value="77,92"><select id="o-Du"><option value="mm">mm</option><option value="in">in</option></select></span>
    </label>
    <p id="o-Dhint" class="hint"></p>
    <div class="row">
      <label data-modes="flow">d orificio
        <span class="combo"><input id="o-d" type="text" inputmode="decimal" value="40"><select id="o-du"><option value="mm">mm</option><option value="in">in</option></select></span>
      </label>
      <label>Tomas de presión
        <select id="o-taps">
          <option value="flange">Brida</option>
          <option value="corner">Esquina</option>
          <option value="dd2">D y D/2</option>
        </select>
      </label>
    </div>
    <p id="o-betaHint" class="hint" data-modes="flow"></p>
  </div>

  <div class="card" data-modes="flow">
    <h2>Presión diferencial</h2>
    <label>Fuente del ΔP
      <select id="o-src">
        <option value="dp">Lectura directa de ΔP</option>
        <option value="ma">Señal 4-20 mA del transmisor</option>
      </select>
    </label>
    <label id="o-dpBox">ΔP
      <span class="combo"><input id="o-dp" type="text" inputmode="decimal" value="250"><select id="o-dpu" data-units="pressure" data-default="mbar"></select></span>
    </label>
    <div id="o-maBox">
      <div class="row">
        <label>Señal (mA) <input id="o-ma" type="text" inputmode="decimal" value="12"></label>
        <label>URV (ΔP a 20 mA)
          <span class="combo"><input id="o-urv" type="text" inputmode="decimal" value="500"><select id="o-urvu" data-units="pressure" data-default="mbar"></select></span>
        </label>
      </div>
      <label>Salida del transmisor
        <select id="o-out">
          <option value="lin">Lineal en ΔP</option>
          <option value="sqrt">Con raíz cuadrada (lineal en caudal)</option>
        </select>
      </label>
      <p class="hint">LRV = 0. Comprueba en el HART o el DCS si la raíz la hace el transmisor o el sistema: el resultado cambia mucho.</p>
    </div>
  </div>

  <div class="card" data-modes="size">
    <h2>Condición de diseño</h2>
    <div class="row">
      <label>Caudal máximo
        <span class="combo"><input id="o-qd" type="text" inputmode="decimal" value="20"><select id="o-qdu"></select></span>
      </label>
      <label>ΔP a caudal máximo
        <span class="combo"><input id="o-dpd" type="text" inputmode="decimal" value="250"><select id="o-dpdu" data-units="pressure" data-default="mbar"></select></span>
      </label>
    </div>
    <p class="hint">Valores típicos de ΔP de diseño: 100–250 inH₂O (250–620 mbar) en líquidos; en gases, que ΔP/p1 no supere ~2–4 %.</p>
  </div>

  <div class="card" data-modes="flow size">
    <h2>Fluido</h2>
    <label>Tipo
      <select id="o-fluid">
        <option value="liq">Líquido</option>
        <option value="bsw">Crudo + agua (BSW)</option>
        <option value="gas">Gas o vapor</option>
      </select>
    </label>
    <div class="row" data-fluids="liq">
      <label>ρ a T de operación (kg/m³) <input id="o-rho" type="text" inputmode="decimal" value="998,2"></label>
    </div>
    <div data-fluids="liq" data-pick="liq"></div>
    <div class="row" data-fluids="bsw">
      <label>BSW (% agua) <input id="o-bsw" type="text" inputmode="decimal" value="60"></label>
      <label>ρ crudo (kg/m³) <input id="o-ro" type="text" inputmode="decimal" value="850"></label>
      <label>ρ agua (kg/m³) <input id="o-rw" type="text" inputmode="decimal" value="1050"></label>
    </div>
    <div data-fluids="bsw" data-pick="ro"></div>
    <p class="hint" data-fluids="bsw">La tabla no trae agua de formación salada: usa la ρ medida.</p>
    <div data-fluids="gas">
      <div class="row">
        <label>p1 aguas arriba
          <span class="combo"><input id="o-p1" type="text" inputmode="decimal" value="10"><select id="o-p1u" data-units="pressure" data-default="bar"></select></span>
        </label>
        <label>Referencia
          <select id="o-p1ref"><option value="g">Manométrica</option><option value="a">Absoluta</option></select>
        </label>
      </div>
      <div class="row">
        <label>Densidad ρ1
          <select id="o-rhomode"><option value="calc">Calcular (p1, T1, M, Z)</option><option value="given">Conocida</option></select>
        </label>
        <label>κ (cp/cv) <input id="o-k" type="text" inputmode="decimal" value="1,3"></label>
      </div>
      <div class="row" id="o-rhoCalcBox">
        <label>T1 (°C) <input id="o-T" type="text" inputmode="decimal" value="25" data-signed></label>
        <label>M (g/mol) <input id="o-M" type="text" inputmode="decimal" value="18,04"></label>
        <label>Z a p1, T1 <input id="o-Z" type="text" inputmode="decimal" value="0,98"></label>
      </div>
      <label id="o-rho1Box">ρ1 a p1, T1 (kg/m³) <input id="o-rho1" type="text" inputmode="decimal" value="5,16"></label>
      <div data-pick="gas"></div>
      <p class="hint">Manométrica: se suma 1,01325 bar. Aire: M = 28,96, κ = 1,40 · Gas natural: M ≈ 17–20, κ ≈ 1,27–1,31 · Vapor sobrecalentado: κ ≈ 1,3, ρ1 de tablas.
      Nm³ y Sm³ solo se calculan con ρ1 calculada (necesitan M).</p>
    </div>
    <label>Viscosidad dinámica (cP) <input id="o-mu" type="text" inputmode="decimal" value="1"></label>
    <p class="hint">Solo afecta a Re y C.</p>
    <p class="hint" data-fluids="bsw">En emulsiones crudo-agua puede ser 10–100 veces la del crudo; si dudas, prueba un valor alto y mira si C cambia.</p>
    <div data-modes="flow">
      <label>Coeficiente de descarga C
        <select id="o-cmode">
          <option value="rhg">Calcular (Reader-Harris/Gallagher)</option>
          <option value="fix">Fijo (hoja de datos o calibración)</option>
        </select>
      </label>
      <label id="o-cfixBox">C fijo <input id="o-cfix" type="text" inputmode="decimal" value="0,605"></label>
    </div>
  </div>

  <div class="card" data-modes="range">
    <h2>Datos de diseño (hoja de datos de la placa)</h2>
    <div class="row">
      <label>Q máx
        <span class="combo"><input id="o-qmax" type="text" inputmode="decimal" value="300"><select id="o-qmaxu"><option value="m3/d">m³/d</option><option value="m3/h">m³/h</option><option value="bbl/d">bbl/d</option><option value="L/min">L/min</option><option value="USgpm">US gpm</option></select></span>
      </label>
      <label>ΔP a Q máx
        <span class="combo"><input id="o-dpmax" type="text" inputmode="decimal" value="500"><select id="o-dpmaxu" data-units="pressure" data-default="mbar"></select></span>
      </label>
      <label>ρ de diseño (kg/m³) <input id="o-rd" type="text" inputmode="decimal" value="1000"></label>
      <label>ρ real (kg/m³) <input id="o-ra" type="text" inputmode="decimal" value="970"></label>
    </div>
  </div>

  <div class="card" data-modes="range">
    <h2>Lectura</h2>
    <label>Fuente
      <select id="o-src2">
        <option value="dp">ΔP directo</option>
        <option value="ma">Señal 4-20 mA (URV = ΔP a Q máx)</option>
      </select>
    </label>
    <label id="o-dp2Box">ΔP actual
      <span class="combo"><input id="o-dp2" type="text" inputmode="decimal" value="250"><select id="o-dp2u" data-units="pressure" data-default="mbar"></select></span>
    </label>
    <div class="row" id="o-ma2Box">
      <label>Señal (mA) <input id="o-ma2" type="text" inputmode="decimal" value="12"></label>
      <label>Salida
        <select id="o-out2"><option value="lin">Lineal en ΔP</option><option value="sqrt">Raíz cuadrada</option></select>
      </label>
    </div>
    <label>Corte de bajo caudal (% de Q máx) <input id="o-cut" type="text" inputmode="decimal" value="5"></label>
  </div>

${resultCardHTML('o', '<button type="button" id="o-reset" class="link">Cargar valores de ejemplo</button>')}
  <details class="note">
    <summary>Método y límites</summary>
    <p>Ecuaciones de ISO 5167-1 y ISO 5167-2:2003: C de Reader-Harris/Gallagher (con el término para D &lt; 71,12 mm),
    ε según la ecuación 5 (ε = 1 para líquidos), pérdida de presión permanente según la ecuación 7.
    C se itera con Re_D hasta converger. El dimensionamiento resuelve β por bisección con Re_D fijado por el caudal.
    Las incertidumbres de C y ε son las de la norma y no incluyen las de D, d, ΔP ni ρ.</p>
    <p>«Desde rango» supone C y ε constantes y corrige solo por densidad: Q = Qmáx · √(ΔP/ΔPmáx) · √(ρdiseño/ρreal).</p>
  </details>
`;

const STORAGE_KEY = 'ict.orifice.v1';
const BBL = 0.158987294928; // m³

const FLOW_UNITS_DESIGN = [
  ['vol:m3/h', 'm³/h (operación)'], ['vol:m3/d', 'm³/d (operación)'], ['vol:bbl/d', 'bbl/d (operación)'],
  ['vol:L/min', 'L/min (operación)'], ['vol:USgpm', 'US gpm (operación)'],
  ['mass:kg/h', 'kg/h'], ['mass:t/h', 't/h'], ['mass:lb/h', 'lb/h'],
  ['std:N', 'Nm³/h (0 °C, 1 atm)'], ['std:S', 'Sm³/h (15 °C, 1 atm)'],
];

let mode = 'flow';
let lastText = '';
let ids = [];
const defaults = {};

const num = (id) => parseNum($(id).value);
const pa = (id, unitId) => convert('pressure', num(id), $(unitId).value, 'Pa');
const toM = (v, u) => (u === 'in' ? v * 0.0254 : v / 1000);

function showIf(el, cond) { el.hidden = !cond; }

/** Lee el diámetro interno (m) y un texto descriptivo. */
function readPipe() {
  if ($('o-Dmode').value === 'nps') {
    const p = pipeID($('o-nps').value, $('o-sch').value);
    $('o-Dhint').textContent =
      `D int = ${fmtFixed(p.id, 2)} mm (${fmtFixed(p.id / 25.4, 3)} in) · OD ${fmtFixed(p.od, 2)} mm · pared ${fmtFixed(p.t, 2)} mm`;
    return { D: p.id / 1000, label: `${$('o-nps').value} Sch ${$('o-sch').value}` };
  }
  $('o-Dhint').textContent = '';
  return { D: toM(num('o-D'), $('o-Du').value), label: 'D manual' };
}

/**
 * Lee el fluido. Devuelve { rho, mu, p1?, kappa?, M?, bsw?, ok, label }.
 * p1 y kappa solo para gases (activan ε).
 */
function readFluid() {
  const type = $('o-fluid').value;
  const mu = num('o-mu') / 1000;
  if (type === 'liq') return { type, rho: num('o-rho'), mu, label: `ρ=${fmt(num('o-rho'), 5)} kg/m³` };
  if (type === 'bsw') {
    const bsw = num('o-bsw') / 100;
    const ro = num('o-ro');
    const rw = num('o-rw');
    const bad = !(bsw >= 0 && bsw <= 1) || !(ro > 0) || !(rw > 0);
    return {
      type, bsw, ro, rw, mu, rho: bad ? NaN : mixtureDensity(bsw, ro, rw),
      label: `BSW=${fmt(bsw * 100, 4)} % ρm=${fmt(mixtureDensity(bsw, ro, rw), 5)} kg/m³`,
    };
  }
  let p1 = pa('o-p1', 'o-p1u');
  if ($('o-p1ref').value === 'g') p1 += P_STD;
  const kappa = num('o-k');
  if ($('o-rhomode').value === 'given') {
    return { type, p1, kappa, mu, rho: num('o-rho1'), label: `p1=${fmt(p1 / 1e5, 5)} bar(a) ρ1=${fmt(num('o-rho1'), 5)} kg/m³ κ=${fmt(kappa, 4)}` };
  }
  const T = num('o-T') + 273.15;
  const M = num('o-M') / 1000;
  const Z = num('o-Z');
  const rho = T > 0 && M > 0 && Z > 0 && p1 > 0 ? gasDensity(p1, T, M, Z) : NaN;
  return {
    type, p1, kappa, mu, rho, M,
    label: `p1=${fmt(p1 / 1e5, 5)} bar(a) T1=${fmt(T - 273.15, 4)} °C M=${fmt(M * 1000, 4)} Z=${fmt(Z, 4)} κ=${fmt(kappa, 4)} → ρ1=${fmt(rho, 5)} kg/m³`,
  };
}

const gasArgs = (f) => (f.type === 'gas' ? { p1: f.p1, kappa: f.kappa } : {});
const stdDensity = (M, T) => gasDensity(P_STD, T, M, 1);

/** ΔP desde la señal mA con LRV = 0. Devuelve { dp, msgs }. */
function dpFromMA(maId, urvPa, outId) {
  const ma = num(maId);
  const msgs = [];
  if (!Number.isFinite(ma)) return { dp: NaN, msgs };
  const st = namurStatus(ma);
  if (st.startsWith('fallo')) msgs.push(['bad', `Señal de ${fmt(ma, 4)} mA en zona de fallo NAMUR NE 43.`]);
  else if (st !== 'ok') msgs.push(['warn', `Señal de ${fmt(ma, 4)} mA fuera de 4–20 mA (saturación).`]);
  const x = Math.max(0, Math.min(1.03, mAToPercent(ma) / 100));
  const sqrt = $(outId).value === 'sqrt';
  if (!sqrt && x < 0.1) {
    msgs.push(['warn', `Señal en ${fmt(x * 100, 3)} % del rango de ΔP: por debajo de ~10 % la raíz cuadrada amplifica el error.`]);
  }
  return { dp: sqrt ? urvPa * x * x : urvPa * x, msgs };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let showResult = () => {};
let pending = {};

/** Guarda el resultado; render() lo pinta al final, junto con el texto para copiar. */
function setResult(main, alt, rows, msgs) {
  pending = { ...(typeof main === 'string' ? { value: main } : main), alt, rows, msgs };
}

const unitSpan = (value, unit) => ({ value, unit });

function fail(text) {
  setResult('—', '', [], [['bad', text]]);
  lastText = '';
}

function validityMsgs(args) {
  return validityChecks(args).map((m) => [m.level, m.text]);
}

function renderFlow() {
  const pipe = readPipe();
  const { D } = pipe;
  const d = toM(num('o-d'), $('o-du').value);
  const taps = $('o-taps').value;
  const f = readFluid();
  const msgs = [];
  $('o-betaHint').textContent = `β = ${d > 0 && D > 0 ? fmtFixed(d / D, 4) : '—'}`;

  let dp;
  if ($('o-src').value === 'dp') dp = pa('o-dp', 'o-dpu');
  else {
    const r = dpFromMA('o-ma', pa('o-urv', 'o-urvu'), 'o-out');
    dp = r.dp;
    msgs.push(...r.msgs);
  }
  if (Number.isFinite(dp) && dp <= 0) {
    setResult('0', 'ΔP ≤ 0: sin caudal medible', [], msgs);
    lastText = '';
    return;
  }
  const Cfixed = $('o-cmode').value === 'fix' ? num('o-cfix') : undefined;
  if (Cfixed !== undefined && !(Cfixed > 0 && Cfixed < 1)) return fail('C fijo debe estar entre 0 y 1.');

  let r;
  try {
    r = orificeFlow({ D, d, dp, rho: f.rho, mu: f.mu, taps, C: Cfixed, ...gasArgs(f) });
  } catch (e) {
    return fail(`Revisa los datos: ${e.message}.`);
  }
  if (!r.converged) msgs.push(['bad', 'La iteración de C no convergió: revisa los datos.']);

  const qh = r.qv * 3600;
  const rows = [];
  let main;
  let alt;
  if (f.type === 'gas') {
    main = unitSpan(fmt(r.qm * 3600, 5), 'kg/h');
    alt = `${fmt(r.qm * 3.6, 5)} t/h · ${fmt(qh, 5)} m³/h a p1, T1`;
    if (f.M) {
      rows.push(['Caudal normal (0 °C, 1 atm, Z=1)', `${fmt(r.qm / stdDensity(f.M, T_NORMAL) * 3600, 5)} Nm³/h`]);
      rows.push(['Caudal estándar (15 °C, 1 atm, Z=1)', `${fmt(r.qm / stdDensity(f.M, T_STANDARD) * 3600, 5)} Sm³/h`]);
    }
    rows.push(['ρ1', `${fmt(f.rho, 5)} kg/m³`]);
    rows.push(['ε (expansibilidad)', `${fmtFixed(r.eps, 5)} (± ${fmt(uncertaintyEps(dp, f.p1, f.kappa), 2)} %)`]);
    rows.push(['ΔP / p1', `${fmt(dp / f.p1 * 100, 3)} %`]);
  } else {
    main = unitSpan(fmt(qh, 5), 'm³/h');
    alt = `${fmt(qh * 24, 5)} m³/d · ${fmt(qh * 24 / BBL, 5)} bbl/d · ${fmt(r.qv * 60000, 5)} L/min`;
    if (f.type === 'bsw') {
      rows.push(['Petróleo (sin deslizamiento)', `${fmt(qh * 24 * (1 - f.bsw), 5)} m³/d`]);
      rows.push(['Agua', `${fmt(qh * 24 * f.bsw, 5)} m³/d`]);
      rows.push(['ρ mezcla', `${fmt(f.rho, 5)} kg/m³`]);
    }
    rows.push(['Caudal másico', `${fmt(r.qm * 3.6, 5)} t/h · ${fmt(r.qm * 3600, 5)} kg/h`]);
  }
  const uC = Cfixed === undefined ? uncertaintyC(r.beta, D * 1000, r.ReD) : NaN;
  rows.push(['C', `${fmtFixed(r.C, 4)}${Cfixed !== undefined ? ' (fijo)' : Number.isFinite(uC) ? ` (± ${fmt(uC, 2)} %)` : ''}`]);
  rows.push(['Re_D', fmt(Math.round(r.ReD), 7)]);
  rows.push(['β', fmtFixed(r.beta, 4)]);
  rows.push(['Velocidad en tubería', `${fmt(r.velocity, 3)} m/s`]);
  rows.push(['ΔP usado', `${fmt(dp / 100, 5)} mbar · ${fmt(convert('pressure', dp, 'Pa', 'inH2O'), 5)} inH₂O`]);
  rows.push(['Pérdida permanente', `${fmt(r.loss / 100, 4)} mbar (${fmtFixed(r.loss / dp * 100, 0)} % del ΔP)`]);

  if (f.type === 'bsw') {
    const sens = [-0.1, 0.1].map((dl) => {
      const b2 = Math.max(0, Math.min(1, f.bsw + dl));
      const r2 = orificeFlow({ D, d, dp, rho: mixtureDensity(b2, f.ro, f.rw), mu: f.mu, taps, C: Cfixed });
      const s = (r2.qv / r.qv - 1) * 100;
      return `${s >= 0 ? '+' : ''}${fmtFixed(s, 1)} %`;
    });
    rows.push(['Sensibilidad al BSW (±10 puntos)', `−10 → ${sens[0]} · +10 → ${sens[1]}`]);
  }

  msgs.push(...validityMsgs({ D, d, ReD: r.ReD, taps, dp, p1: f.p1, Cfixed: Cfixed !== undefined }));
  if (f.type !== 'gas' && r.velocity > 3) msgs.push(['warn', `Velocidad de ${fmt(r.velocity, 3)} m/s: revisa la erosión del borde y si el ΔP es coherente.`]);
  if (f.type === 'bsw') msgs.push(['ok', 'Supone mezcla homogénea sin gas libre. Con gas libre aguas arriba el caudal calculado sale alto.']);
  if (f.type === 'gas') msgs.push(['ok', 'Nm³ y Sm³ suponen comportamiento ideal (Z = 1) en condiciones de referencia.']);
  setResult(main, alt, rows, msgs);

  lastText = [
    'Caudal placa orificio (ISO 5167-2)',
    `D=${fmtFixed(D * 1000, 2)} mm (${pipe.label})  d=${fmtFixed(d * 1000, 2)} mm  β=${fmtFixed(r.beta, 4)}  tomas: ${TAPS[taps]}`,
    `ΔP=${fmt(dp / 100, 5)} mbar  ${f.label}  μ=${fmt(f.mu * 1000, 4)} cP`,
    `C=${fmtFixed(r.C, 4)}${Cfixed !== undefined ? ' (fijo)' : ''}  ε=${fmtFixed(r.eps, 5)}  Re_D=${Math.round(r.ReD)}`,
    `qm=${fmt(r.qm * 3600, 5)} kg/h  qv=${fmt(qh, 5)} m³/h (${fmt(qh * 24, 5)} m³/d)`,
  ].join('\n');
}

function renderSize() {
  const pipe = readPipe();
  const { D } = pipe;
  const taps = $('o-taps').value;
  const f = readFluid();
  const dp = pa('o-dpd', 'o-dpdu');
  const q = num('o-qd');
  const [kind, unit] = $('o-qdu').value.split(':');
  let qm;
  if (kind === 'mass') qm = convert('massFlow', q, unit, 'kg/s');
  else if (kind === 'vol') qm = convert('volFlow', q, unit, 'm3/s') * f.rho;
  else {
    if (f.type !== 'gas' || !f.M) return fail('Nm³/h y Sm³/h necesitan un gas con ρ1 calculada a partir de M.');
    qm = (q / 3600) * stdDensity(f.M, unit === 'N' ? T_NORMAL : T_STANDARD);
  }

  let s;
  try {
    s = sizeOrifice({ D, qm, dp, rho: f.rho, mu: f.mu, taps, ...gasArgs(f) });
  } catch (e) {
    return fail(e.message);
  }
  const uC = uncertaintyC(s.beta, D * 1000, s.ReD);
  const rows = [
    ['β', fmtFixed(s.beta, 4)],
    ['C', `${fmtFixed(s.C, 4)}${Number.isFinite(uC) ? ` (± ${fmt(uC, 2)} %)` : ''}`],
  ];
  if (f.type === 'gas') rows.push(['ε', fmtFixed(s.eps, 5)]);
  rows.push(
    ['Re_D', fmt(Math.round(s.ReD), 7)],
    ['Caudal másico', `${fmt(qm * 3600, 5)} kg/h`],
    ['Caudal a condiciones de operación', `${fmt(qm / f.rho * 3600, 5)} m³/h`],
    ['Velocidad en tubería', `${fmt(s.velocity, 3)} m/s`],
    ['Pérdida permanente', `${fmt(s.loss / 100, 4)} mbar (${fmtFixed(s.loss / dp * 100, 0)} % del ΔP)`],
    ['ΔP a 50 % / 25 % del caudal', `${fmt(dp / 400, 4)} / ${fmt(dp / 1600, 4)} mbar`],
  );
  const msgs = validityMsgs({ D, d: s.d, ReD: s.ReD, taps, dp, p1: f.p1 });
  if (s.beta >= 0.2 && s.beta <= 0.6) msgs.push(['ok', 'β entre 0,2 y 0,6: zona de menor incertidumbre de C.']);
  else if (s.beta >= 0.1 && s.beta <= 0.75) msgs.push(['warn', 'β fuera de 0,2–0,6: es válido, pero C tiene más incertidumbre. Considera cambiar el ΔP de diseño.']);
  msgs.push(['ok', 'Redondea d a la precisión de mecanizado y recalcula en «Calcular caudal» con el d real.']);
  setResult(unitSpan(fmtFixed(s.d * 1000, 2), 'mm'), `${fmtFixed(s.d / 0.0254, 4)} in`, rows, msgs);

  lastText = [
    'Dimensionamiento placa orificio (ISO 5167-2)',
    `D=${fmtFixed(D * 1000, 2)} mm (${pipe.label})  tomas: ${TAPS[taps]}`,
    `Qmax=${fmt(q, 5)} ${FLOW_UNITS_DESIGN.find(([v]) => v === $('o-qdu').value)[1]}  ΔPmax=${fmt(dp / 100, 5)} mbar`,
    `${f.label}  μ=${fmt(f.mu * 1000, 4)} cP`,
    `d=${fmtFixed(s.d * 1000, 2)} mm (${fmtFixed(s.d / 0.0254, 4)} in)  β=${fmtFixed(s.beta, 4)}  C=${fmtFixed(s.C, 4)}  Re_D=${Math.round(s.ReD)}`,
  ].join('\n');
}

function renderRange() {
  const unit = $('o-qmaxu').value;
  const qmaxIn = num('o-qmax');
  const qmax = convert('volFlow', qmaxIn, unit, 'm3/s');
  const dpmax = pa('o-dpmax', 'o-dpmaxu');
  const msgs = [];
  let dp;
  if ($('o-src2').value === 'dp') dp = pa('o-dp2', 'o-dp2u');
  else {
    const r = dpFromMA('o-ma2', dpmax, 'o-out2');
    dp = r.dp;
    msgs.push(...r.msgs);
  }
  if (!Number.isFinite(dp)) return fail('Falta la lectura de ΔP o de mA.');
  let r;
  try {
    r = flowFromRange({ qmax, dpmax, dp, rhoDesign: num('o-rd'), rhoActual: num('o-ra'), cutoff: num('o-cut') / 100 });
  } catch (e) {
    return fail(`Revisa los datos de diseño: ${e.message}.`);
  }
  const out = (m3s) => convert('volFlow', m3s, 'm3/s', unit);
  const ulabel = QUANTITIES.volFlow.units[unit].label;
  const rows = [
    ['% de Q máx', `${fmtFixed(r.frac * 100, 1)} %`],
    ['% de ΔP máx', `${fmtFixed(r.dpFrac * 100, 1)} %`],
    ['Corrección por densidad', `× ${fmtFixed(r.K, 4)}`],
    ['Q sin corregir', `${fmt(out(r.qRaw), 5)} ${ulabel}`],
  ];
  if (r.cut) msgs.push(['warn', `Por debajo del corte de bajo caudal (${fmt(num('o-cut'), 3)} % de Q máx): se informa 0.`]);
  else if (r.dpFrac < 0.1) msgs.push(['warn', `ΔP en ${fmtFixed(r.dpFrac * 100, 1)} % del rango: zona de baja precisión.`]);
  if (r.dpFrac > 1) msgs.push(['warn', 'ΔP por encima del máximo de diseño: el transmisor puede estar saturado.']);
  if (Math.abs(r.K - 1) > 0.05) {
    msgs.push(['warn', `La densidad real difiere más de un 10 % de la de diseño (corrección ${fmtFixed((r.K - 1) * 100, 1)} %). Conviene recalcular con ISO 5167.`]);
  }
  msgs.push(['ok', 'Supone C constante (el de diseño). Si la viscosidad cambió mucho, usa «Calcular caudal».']);
  const m3h = r.q * 3600;
  setResult(unitSpan(fmt(out(r.q), 5), ulabel), `${fmt(m3h, 5)} m³/h · ${fmt(m3h * 24, 5)} m³/d · ${fmt(m3h * 24 / BBL, 5)} bbl/d`, rows, msgs);

  lastText = [
    'Caudal desde rango de placa orificio',
    `Qmax=${fmt(qmaxIn, 5)} ${ulabel} a ΔPmax=${fmt(dpmax / 100, 5)} mbar`,
    `ρdiseño=${fmt(num('o-rd'), 5)}  ρreal=${fmt(num('o-ra'), 5)} kg/m³  K=${fmtFixed(r.K, 4)}`,
    `Q=${fmt(out(r.q), 5)} ${ulabel} (${fmtFixed(r.frac * 100, 1)} % de Qmax)`,
  ].join('\n');
}

function render() {
  const view = $('o-main').closest('[data-view]');
  view.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  view.querySelectorAll('[data-modes]').forEach((el) => showIf(el, el.dataset.modes.split(' ').includes(mode)));
  const fluid = $('o-fluid').value;
  view.querySelectorAll('[data-fluids]').forEach((el) => showIf(el, el.dataset.fluids === fluid));
  const npsMode = $('o-Dmode').value === 'nps';
  showIf($('o-npsBox'), npsMode);
  showIf($('o-manBox'), !npsMode);
  showIf($('o-dpBox'), $('o-src').value === 'dp');
  showIf($('o-maBox'), $('o-src').value === 'ma');
  showIf($('o-dp2Box'), $('o-src2').value === 'dp');
  showIf($('o-ma2Box'), $('o-src2').value === 'ma');
  showIf($('o-cfixBox'), $('o-cmode').value === 'fix');
  const given = $('o-rhomode').value === 'given';
  showIf($('o-rhoCalcBox'), !given);
  showIf($('o-rho1Box'), given);

  if (mode === 'flow') renderFlow();
  else if (mode === 'size') renderSize();
  else renderRange();
  showResult({ ...pending, text: lastText });
  save();
}

// ---------------------------------------------------------------------------
// Persistencia (solo comodidad local; la app funciona sin ella)
// ---------------------------------------------------------------------------

function save() {
  try {
    const o = { _mode: mode };
    for (const id of ids) o[id] = $(id).value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch { /* almacenamiento no disponible */ }
}

function load() {
  try {
    const o = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!o) return;
    if (['flow', 'size', 'range'].includes(o._mode)) mode = o._mode;
    if (PIPES[o['o-nps']]) { $('o-nps').value = o['o-nps']; fillSchedules(o['o-sch']); }
    for (const id of ids) {
      if (id === 'o-nps' || id === 'o-sch' || o[id] === undefined) continue;
      const el = $(id);
      el.value = o[id];
      if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.value = defaults[id];
    }
  } catch { /* datos guardados corruptos: se ignoran */ }
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

/** Pone valores en los campos; el schedule se rellena después del NPS. */
function applyValues(values) {
  for (const id of ids) if (id !== 'o-sch' && values[id] !== undefined) $(id).value = values[id];
  fillSchedules(values['o-sch']);
}

function fillSchedules(prefer) {
  const sel = $('o-sch');
  const prev = prefer || sel.value || '40 / STD';
  sel.innerHTML = '';
  for (const k of schedules($('o-nps').value).keys()) sel.add(new Option(`Sch ${k}`, k));
  sel.value = matchSchedule($('o-nps').value, prev);
}

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'o');
  const view = section;
  for (const sel of view.querySelectorAll('select[data-units]')) {
    for (const [k, u] of Object.entries(QUANTITIES[sel.dataset.units].units)) sel.add(new Option(u.label, k));
    sel.value = sel.dataset.default;
  }
  for (const [v, label] of FLOW_UNITS_DESIGN) $('o-qdu').add(new Option(label, v));
  $('o-qdu').value = 'vol:m3/h';
  for (const k of Object.keys(PIPES)) $('o-nps').add(new Option(k, k));
  $('o-nps').value = '3"';
  fillSchedules('40 / STD');

  ids = [...view.querySelectorAll('input, select')].map((el) => el.id).filter(Boolean);
  for (const id of ids) defaults[id] = $(id).value;

  const tabs = [...view.querySelectorAll('.tabs [data-mode]')];
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => { mode = b.dataset.mode; render(); });
    b.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  });
  // 'input' llega antes que 'change': el schedule se ajusta al NPS antes de calcular.
  const onEdit = (e) => { if (e.target.id === 'o-nps') fillSchedules(); render(); };
  view.addEventListener('input', onEdit);
  view.addEventListener('change', onEdit);
  $('o-reset').addEventListener('click', () => {
    const before = { mode, values: Object.fromEntries(ids.map((id) => [id, $(id).value])) };
    applyValues(defaults);
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { mode = before.mode; applyValues(before.values); render(); },
    });
  });

  mountPickers(view);

  load();
  render();
}

/** Escribe `value` en un campo y avisa a la vista para que recalcule. */
function setField(id, value) {
  $(id).value = value;
  $(id).dispatchEvent(new Event('input', { bubbles: true }));
}

/** T1 (K) y p1 (Pa abs) del formulario del gas, para calcular Z con la tabla. */
function gasContext() {
  const T = num('o-T') + 273.15;
  const p = pa('o-p1', 'o-p1u') + ($('o-p1ref').value === 'g' ? P_STD : 0);
  if (!(T > 0) || !(p > 0)) throw new RangeError('Rellena p1 y T1 arriba para calcular Z.');
  return { T, p };
}

/** «Elegir de la tabla» junto a los campos de densidad. Van después de reunir los ids: no se guardan con el estado. */
function mountPickers(view) {
  const host = (k) => view.querySelector(`[data-pick="${k}"]`);
  mountPicker(host('liq'), {
    id: 'o-pick-liq', kind: 'liquid', apply: (r) => {
      setField('o-rho', fmt(r.rho, 6));
      if (r.mu !== null) setField('o-mu', fmt(r.mu, 4));
      return r.mu !== null ? 'ρ y μ aplicadas ✓' : 'ρ aplicada ✓ (sin μ: revísala)';
    },
  });
  mountPicker(host('ro'), {
    id: 'o-pick-ro', kind: 'liquid', def: 'crude', summary: 'Elegir el crudo de la tabla',
    apply: (r) => { setField('o-ro', fmt(r.rho, 6)); return 'ρ crudo aplicada ✓'; },
  });
  mountPicker(host('gas'), {
    id: 'o-pick-gas', kind: 'gas', section: view, context: gasContext,
    apply: (r) => {
      $('o-rhomode').value = 'calc';
      setField('o-M', fmt(r.M, 6));
      setField('o-k', fmt(r.kappa, 4));
      setField('o-Z', fmt(r.Z, 4));
      return 'M, κ y Z aplicadas ✓';
    },
  });
}
