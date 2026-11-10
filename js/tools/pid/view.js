// Sintonía de lazos PID: modelo del proceso (prueba de escalón, modelo conocido o ciclo
// sostenido), regla de sintonía, robustez y parámetros en la forma de cada controlador.
// La lógica vive en js/pid.js (testeada).
import {
  PROCESS, RULES, ULTIMATE_RULES, CONTROLLERS, ruleTypes, stepLevels, identifySelf, identifyInteg,
  tune, tuneUltimate, defaultLambda, robustness, msClass, simulate, actionFor,
} from '../../pid.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import {
  resultCardHTML, bindResultCard, enhanceSigned, toast, copyToClipboard, flash,
} from '../../components.js';

const num = (id, value = '', signed = false) =>
  `<input id="${id}" type="text" inputmode="decimal"${signed ? ' data-signed' : ''} value="${value}">`;
const options = (obj, def, label = (v) => v.label ?? v) => Object.entries(obj)
  .map(([k, v]) => `<option value="${k}"${k === def ? ' selected' : ''}>${label(v)}</option>`).join('');

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Origen del modelo">
    <button type="button" role="tab" data-mode="step">Escalón</button>
    <button type="button" role="tab" data-mode="model">Modelo</button>
    <button type="button" role="tab" data-mode="ultimate">Ciclo sostenido</button>
  </div>

  <div class="card">
    <h2>Rangos del lazo</h2>
    <div class="row">
      <label>PV LRV ${num('p-pvlo', '0', true)}</label>
      <label>PV URV ${num('p-pvhi', '100', true)}</label>
      <label>Unidad PV <input id="p-pvu" type="text" maxlength="12" value="°C"></label>
    </div>
    <div class="row">
      <label>CV mín ${num('p-cvlo', '0', true)}</label>
      <label>CV máx ${num('p-cvhi', '100', true)}</label>
      <label>Tiempos en <select id="p-tu"><option value="s">segundos</option><option value="min">minutos</option></select></label>
    </div>
    <p class="hint">Los mismos rangos que tiene configurados el bloque PID. Con ellos la ganancia se pasa a % de span.</p>
  </div>

  <div class="card" data-modes="step model">
    <h2>Proceso</h2>
    <label>Tipo <select id="p-kind">${options(PROCESS, 'self')}</select></label>
    <p class="hint" data-kinds="self">Autorregulado: tras el escalón la PV se estabiliza en un valor nuevo
      (temperatura, caudal, presión de líquido). Se modela como primer orden con tiempo muerto.</p>
    <p class="hint" data-kinds="integ">Integrador: la PV no se estabiliza sola, sigue subiendo o bajando
      (nivel con bomba de caudal fijo, presión de gas en un recipiente cerrado).</p>
  </div>

  <div class="card" data-modes="step">
    <h2>Prueba de escalón en manual</h2>
    <p class="hint">Con el lazo en manual y la PV estable (o con pendiente constante si es integrador),
      cambia la CV de golpe y anota la respuesta. Tiempos medidos desde el instante del escalón.</p>
    <div class="row">
      <label>CV antes ${num('p-cv0', '40', true)}</label>
      <label>CV después ${num('p-cv1', '50', true)}</label>
    </div>
    <div data-kinds="self">
      <div class="row">
        <label>PV antes ${num('p-pv0', '60', true)}</label>
        <label>PV final estable ${num('p-pv1', '75', true)}</label>
      </div>
      <label>Método <select id="p-method">
        <option value="smith">Dos puntos: t28 y t63 (Smith)</option>
        <option value="t63">Inicio de la respuesta y t63</option>
      </select></label>
      <p class="hint" id="p-levels"></p>
      <div class="row">
        <label data-methods="smith">t28 ${num('p-t28', '25')}</label>
        <label data-methods="t63">Inicio (tiempo muerto) ${num('p-ts', '10')}</label>
        <label>t63 ${num('p-t63', '55')}</label>
      </div>
    </div>
    <div data-kinds="integ">
      <div class="row">
        <label><span>Pendiente PV antes (<span class="p-unit-rate"></span>)</span> ${num('p-sl0', '0', true)}</label>
        <label><span>Pendiente PV después (<span class="p-unit-rate"></span>)</span> ${num('p-sl1', '2', true)}</label>
      </div>
      <label>Tiempo muerto (hasta que cambia la pendiente) ${num('p-ti0', '5')}</label>
      <p class="hint">Pendiente = cambio de PV / tiempo, en la unidad de tiempo elegida arriba.</p>
    </div>
  </div>

  <div class="card" data-modes="model">
    <h2>Modelo del proceso</h2>
    <div class="row">
      <label><span id="p-kl">K (% PV / % CV)</span> ${num('p-K', '1,5', true)}</label>
      <label data-kinds="self">τ (constante de tiempo) ${num('p-tau', '45')}</label>
      <label>θ (tiempo muerto) ${num('p-theta', '10')}</label>
    </div>
    <p class="hint">K en % del span de PV por % de CV. Si tienes K en unidades de ingeniería,
      usa la pestaña Escalón con los valores del ensayo.</p>
  </div>

  <div class="card" data-modes="ultimate">
    <h2>Ensayo de ciclo sostenido</h2>
    <p class="hint">En automático, solo P, sube Kc hasta que la PV oscile con amplitud constante.
      Ojo: lleva el proceso al límite de estabilidad; en muchos lazos no es aceptable.</p>
    <div class="row">
      <label>Ganancia última Ku (%/%) ${num('p-ku', '4')}</label>
      <label>Periodo último Pu ${num('p-pu', '40')}</label>
    </div>
  </div>

  <div class="card">
    <h2>Sintonía</h2>
    <div class="row">
      <label>Regla <select id="p-rule"></select></label>
      <label>Controlador <select id="p-type"></select></label>
    </div>
    <label data-modes="step model"><span id="p-laml">λ</span> ${num('p-lam', '')}</label>
    <p class="hint" data-modes="step model" id="p-lamh"></p>
  </div>

  <div class="card">
    <h2>Bloque de destino</h2>
    <label>PLC / instrucción <select id="p-ctl">${options(CONTROLLERS, 'logix-pide-dep')}</select></label>
  </div>

  ${resultCardHTML('p', '<div class="actions"><button type="button" id="p-reset">Valores de ejemplo</button></div>')}

  <div class="card" id="p-simcard">
    <h2>Respuesta simulada</h2>
    <div id="p-plot" class="plot"></div>
    <p class="hint">Escalón de consigna de 1 % y, a mitad, perturbación de carga de −1 % en la CV.
      Lineal y sin límites de CV: sirve para comparar reglas, no para predecir la planta.</p>
  </div>

  <details class="note">
    <summary>Cómo se calcula</summary>
    <p>Autorregulado: modelo de primer orden con tiempo muerto, G = K·e<sup>−θs</sup>/(τs + 1).
      Dos puntos (Smith): τ = 1,5·(t63 − t28), θ = t63 − τ. Integrador: G = K·e<sup>−θs</sup>/s,
      K = Δpendiente (% / tiempo) / ΔCV (%).</p>
    <p>Lambda: Kc = τ / (K·(λ + θ)), Ti = τ; PID por IMC con Padé (Rivera 1986). Integrador:
      Ti = 2λ + θ, Kc = Ti / (K·(λ + θ)²). SIMC (Skogestad 2003): Kc = τ / (K·(τc + θ)),
      Ti = min(τ, 4·(τc + θ)). Ziegler-Nichols y Cohen-Coon: tablas clásicas, pensadas para
      decaimiento 1/4, o sea muy oscilantes.</p>
    <p>Todo se calcula en forma ideal (ISA) y se convierte a la del bloque elegido. Ms es el pico de
      la función de sensibilidad: 1,2–1,4 robusto, 1,4–1,7 normal, más de 2 frágil ante cambios del proceso.
      Margen de ganancia: cuánto puede crecer K del proceso antes de oscilar.</p>
  </details>
`;

let mode = 'step';
let ids = [];
const defaults = {};
let showResult = () => {};

const val = (id) => parseNum($(id).value);
const tf = () => ($('p-tu').value === 'min' ? 60 : 1);
const tu = () => ($('p-tu').value === 'min' ? 'min' : 's');
/** Tiempo en s → texto en la unidad elegida. */
const tfmt = (s, sig = 4) => (Number.isFinite(s) ? `${fmt(s / tf(), sig)} ${tu()}` : '∞');

const CONF = {
  cierto: ['ok', 'Unidades verificadas en la documentación del fabricante.'],
  probable: ['warn', 'Unidades deducidas de documentación incompleta: verifícalas antes de cargar.'],
  suposicion: ['bad', 'Forma y unidades NO verificadas: compruébalas en la ayuda del software antes de cargar.'],
};
const MS_TEXT = {
  conservative: 'robusta y lenta',
  balanced: 'equilibrada',
  aggressive: 'agresiva',
  fragile: 'poco robusta',
  unstable: 'inestable',
};

function fail(text) {
  $('p-load').hidden = true;
  showResult({ value: '—', msgs: [['bad', text]] });
  drawPlot(null);
}

function ranges() {
  const pvLo = val('p-pvlo');
  const pvHi = val('p-pvhi');
  const cvLo = val('p-cvlo');
  const cvHi = val('p-cvhi');
  if ([pvLo, pvHi, cvLo, cvHi].some(Number.isNaN) || pvLo === pvHi || cvLo === cvHi) return null;
  return { pvSpan: Math.abs(pvHi - pvLo), cvSpan: Math.abs(cvHi - cvLo), unit: $('p-pvu').value.trim() };
}

/** Rellena las reglas y los tipos según el modo y el proceso, conservando la selección. */
function refreshSelects() {
  const kind = $('p-kind').value;
  const ruleSel = $('p-rule');
  const prevRule = ruleSel.value;
  const rules = mode === 'ultimate'
    ? ULTIMATE_RULES
    : Object.fromEntries(Object.entries(RULES).filter(([, r]) => r[kind]));
  ruleSel.innerHTML = options(rules, prevRule in rules ? prevRule : Object.keys(rules)[0]);
  const types = mode === 'ultimate' ? ULTIMATE_RULES[ruleSel.value].types : ruleTypes(ruleSel.value, kind);
  const typeSel = $('p-type');
  const prevType = typeSel.value;
  typeSel.innerHTML = types.map((t) => `<option${t === prevType ? ' selected' : ''}>${t}</option>`).join('');
  if (!types.includes(prevType)) typeSel.value = types.includes('PI') ? 'PI' : types[0];
}

/** Modelo del proceso según el modo. Devuelve { model, notes } o lanza con el texto del error. */
function readModel(R) {
  const kind = $('p-kind').value;
  const f = tf();
  if (mode === 'model') {
    const K = val('p-K');
    const theta = val('p-theta') * f;
    const tau = val('p-tau') * f;
    if (!Number.isFinite(K) || K === 0) throw new Error('K no válida (≠ 0).');
    if (!(theta >= 0)) throw new Error('θ no válido (≥ 0).');
    if (kind === 'self' && !(tau > 0)) throw new Error('τ no válida (> 0).');
    // Integrador: K introducida por unidad de tiempo elegida → por segundo.
    return { model: { kind, K: kind === 'integ' ? K / f : K, tau, theta }, warnings: [] };
  }
  const cv0 = val('p-cv0');
  const cv1 = val('p-cv1');
  if (Number.isNaN(cv0) || Number.isNaN(cv1)) throw new Error('CV antes y después no válidas.');
  if (kind === 'self') {
    const r = identifySelf({
      pv0: val('p-pv0'), pv1: val('p-pv1'), cv0, cv1, pvSpan: R.pvSpan, cvSpan: R.cvSpan,
      method: $('p-method').value, t28: val('p-t28') * f, t63: val('p-t63') * f, tStart: val('p-ts') * f,
    });
    if ([r.K, r.tau, r.theta].some(Number.isNaN)) throw new Error('Revisa los valores de PV del ensayo.');
    return { model: { kind, K: r.K, tau: r.tau, theta: r.theta }, warnings: r.warnings };
  }
  const r = identifyInteg({
    slope0: val('p-sl0') / f, slope1: val('p-sl1') / f, cv0, cv1,
    pvSpan: R.pvSpan, cvSpan: R.cvSpan, tStart: val('p-ti0') * f,
  });
  if ([r.K, r.theta].some(Number.isNaN)) throw new Error('Revisa las pendientes del ensayo.');
  return { model: { kind, K: r.K, theta: r.theta }, warnings: r.warnings };
}

function paramsText(ctl, p, R) {
  return CONTROLLERS[ctl].params(p, R).map(([n, v, u]) => [n, Number.isFinite(v) ? fmt(v, 4) : '—', u]);
}

function render() {
  const view = $('p-kind').closest('section') || document;
  view.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const kind = $('p-kind').value;
  view.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
  view.querySelectorAll('[data-kinds]').forEach((el) => { el.hidden = el.dataset.kinds !== kind; });
  view.querySelectorAll('[data-methods]').forEach((el) => { el.hidden = el.dataset.methods !== $('p-method').value; });
  view.querySelectorAll('.p-unit-rate').forEach((el) => { el.textContent = `${$('p-pvu').value.trim() || 'u.'}/${tu()}`; });
  $('p-kl').textContent = kind === 'integ' ? `K (% PV/${tu()} por % CV)` : 'K (% PV / % CV)';
  refreshSelects();
  const rule = $('p-rule').value;
  $('p-laml').textContent = rule === 'simc' ? `τc, lazo cerrado (${tu()})` : `λ, lazo cerrado (${tu()})`;
  saveState('pid', { mode, values: snapshot() });

  const pv0 = val('p-pv0');
  const pv1 = val('p-pv1');
  if (Number.isFinite(pv0) && Number.isFinite(pv1)) {
    const L = stepLevels(pv0, pv1);
    $('p-levels').textContent = `Busca en la tendencia: t28 cuando la PV pasa por ${fmt(L.p28, 5)} y t63 cuando pasa por ${fmt(L.p63, 5)}.`;
  }

  const R = ranges();
  if (!R) return fail('Revisa los rangos de PV y CV (números y LRV ≠ URV).');
  const type = $('p-type').value;
  const ctl = $('p-ctl').value;
  const C = CONTROLLERS[ctl];
  const msgs = [];
  const rows = [];
  let model = null;
  let p;

  if (mode === 'ultimate') {
    const Ku = val('p-ku');
    const Pu = val('p-pu') * tf();
    if (!(Ku > 0) || !(Pu > 0)) return fail('Ku y Pu deben ser > 0.');
    p = tuneUltimate(rule, type, Ku, Pu);
    rows.push(['Ensayo', `Ku ${fmt(Ku, 4)} · Pu ${tfmt(Pu)}`]);
    msgs.push(['warn', 'Con el ciclo sostenido no hay modelo: no se calcula la robustez ni la respuesta simulada.']);
  } else {
    let warnings;
    try {
      ({ model, warnings } = readModel(R));
    } catch (e) {
      return fail(e.message);
    }
    const lamIn = $('p-lam').value.trim();
    let lam;
    if (lamIn) {
      lam = val('p-lam') * tf();
      if (!(lam >= 0)) return fail('λ no válido (≥ 0).');
    }
    const lamAuto = defaultLambda(rule, model);
    $('p-lamh').textContent = rule === 'lambda' || rule === 'simc'
      ? `Vacío = ${tfmt(lamAuto)} (${rule === 'simc' ? 'τc = θ' : model.kind === 'integ' ? '3·θ' : 'el mayor de τ y 3·θ'}). Más grande = más lento y robusto.`
      : 'Esta regla no usa λ.';
    p = tune(rule, type, model, lam);
    if (!p) {
      if (model.theta === 0 && (rule === 'zn' || rule === 'cc')) return fail('Ziegler-Nichols y Cohen-Coon necesitan θ > 0.');
      if (model.theta === 0) return fail('Con θ = 0, indica λ (o τc) a mano.');
      return fail('La regla no tiene versión para este caso.');
    }
    for (const w of warnings) {
      if (w === 'neg-theta') msgs.push(['warn', 'Los tiempos dan θ negativo: lo he dejado en 0. Revisa t28 y t63 (la curva quizá no es de primer orden).']);
      if (w === 'small-step') msgs.push(['warn', 'Escalón de CV menor del 3 %: el ruido pesa mucho en la identificación.']);
    }
    const Kunit = model.kind === 'integ' ? `%/${tu()} por %` : '%/%';
    const Kshow = model.kind === 'integ' ? model.K * tf() : model.K;
    rows.push(['Modelo', `K ${fmt(Kshow, 4)} ${Kunit}${model.kind === 'self' ? ` · τ ${tfmt(model.tau)}` : ''} · θ ${tfmt(model.theta)}`]);
    if (model.kind === 'self') {
      const r = model.theta / model.tau;
      rows.push(['θ/τ', fmtFixed(r, 2)]);
      if (r < 0.1) msgs.push(['ok', 'θ/τ < 0,1: proceso fácil; casi cualquier regla funciona, y λ puede ser pequeño.']);
      if (r > 1) msgs.push(['warn', 'θ/τ > 1: el tiempo muerto domina. Usa Lambda o SIMC y PI; la derivativa ayuda poco.']);
    }
    if (p.lambda !== undefined) rows.push([rule === 'simc' ? 'τc' : 'λ', tfmt(p.lambda)]);
    msgs.push(['ok', `Acción ${actionFor(model.K) === 'reverse' ? 'INVERSA (e = SP − PV): al subir la CV sube la PV' : 'DIRECTA (e = PV − SP): al subir la CV baja la PV'}.`]);
  }
  if (!p) return fail('La regla no tiene versión para este tipo de controlador.');

  // Parámetros en el bloque elegido: siempre P, I y D, en ese orden.
  const params = paramsText(ctl, p, R);
  const why = zeroReasons(p, type, rule, ctl, model);
  drawLoad(params, why, C.label);
  rows.push(['Forma ideal (ISA)', `Kc ${fmt(p.Kc, 4)} · Ti ${tfmt(p.Ti)} · Td ${tfmt(p.Td)}`]);
  if (C.setup) msgs.push(['ok', C.setup]);
  msgs.push(CONF[C.confidence]);
  if (C.note) msgs.push([C.confidence === 'cierto' ? 'ok' : 'warn', C.note]);
  if (C.limits) {
    const raw = C.params(p, R);
    for (const [name, v] of raw) {
      const key = name.split(' ')[0];
      const lim = C.limits[key];
      if (lim && (v < lim[0] || v > lim[1])) msgs.push(['bad', `${name} = ${fmt(v, 5)} está fuera del rango del bloque (${lim[0]}–${lim[1]}).`]);
    }
  }
  if (ctl === 'm221-pid' && p.Kc < 0.5) msgs.push(['warn', `Kp entero de ${Math.round(p.Kc * 100)}: el redondeo a 0,01 se come parte de la ganancia. Comprueba que el Kc real (Kp/100) siga dando una robustez aceptable.`]);
  if (ctl === 'series' && !params.some(([, v]) => v !== '—')) msgs.push(['bad', 'Ti < 4·Td: esta sintonía no existe en forma serie.']);
  if (rule === 'zn' || rule === 'cc') msgs.push(['warn', 'Ziegler-Nichols y Cohen-Coon buscan decaimiento 1/4: oscilan y toleran poco que el proceso cambie. Úsalas como punto de partida y baja Kc.']);
  if (type === 'PID' && model?.kind === 'self' && model.theta / model.tau < 0.2) msgs.push(['ok', 'Con θ pequeño la derivativa aporta poco y amplifica ruido: considera PI.']);

  let sim = null;
  if (model) {
    const rb = robustness(model, p);
    const cls = msClass(rb.Ms);
    rows.push(['Robustez', rb.stable
      ? `Ms ${fmtFixed(rb.Ms, 2)} (${MS_TEXT[cls]}) · margen de ganancia ${Number.isFinite(rb.gm) ? fmtFixed(rb.gm, 2) : '∞'} · margen de fase ${Number.isFinite(rb.pm) ? fmtFixed(rb.pm, 0) : '—'}°`
      : 'INESTABLE con este modelo']);
    if (!rb.stable) msgs.unshift(['bad', 'El lazo cerrado sería inestable con este modelo. Baja Kc o sube λ.']);
    else if (cls === 'fragile') msgs.unshift(['warn', `Ms ${fmtFixed(rb.Ms, 2)}: un cambio pequeño del proceso puede hacerlo oscilar. Baja Kc o usa Lambda.`]);
    sim = simulate(model, p);
    if (rb.stable) rows.push(['Sobrepico (consigna)', `${fmtFixed(sim.overshoot * 100, 0)} %`]);

    // Comparación con las otras reglas para el mismo tipo
    for (const [id, r] of Object.entries(RULES)) {
      if (id === rule || !r[model.kind]) continue;
      const q = tune(id, type, model);
      if (!q) continue;
      const rq = robustness(model, q);
      rows.push([`Comparar: ${r.label}`, `Kc ${fmt(q.Kc, 3)} · Ti ${tfmt(q.Ti, 3)}${q.Td ? ` · Td ${tfmt(q.Td, 3)}` : ''} · ${rq.stable ? `Ms ${fmtFixed(rq.Ms, 2)}` : 'inestable'}`]);
    }
  }
  drawPlot(sim, model);

  showResult({
    value: params.map(([, v], i) => `${'PID'[i]} ${v}`).join(' · '),
    rows,
    msgs,
    text: [`Sintonía ${type} · ${(mode === 'ultimate' ? ULTIMATE_RULES : RULES)[rule].label} · ${C.label}`,
      ...params.map(([n, v, u], i) => `${n}: ${v}${u ? ` ${u}` : ''}${why[i] ? ` (${why[i]})` : ''}`),
      ...rows.map(([k, v]) => `${k}: ${v.replaceAll(' · ', ', ')}`),
      ...(C.setup ? [C.setup] : []), ...(C.source ? [`Fuente: ${C.source}`] : [])].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// Constantes para cargar
// ---------------------------------------------------------------------------

const ROLES = ['P · proporcional', 'I · integral', 'D · derivativa'];

/** Por qué I o D quedan anuladas, para que nadie piense que falta un dato. [texto P, texto I, texto D] */
function zeroReasons(p, type, rule, ctl, model) {
  const why = ['', '', ''];
  if (!Number.isFinite(p.Ti)) {
    why[1] = 'Sin integral porque elegiste P: quedará un error permanente (offset).';
    if (ctl === 'm221-pid') why[1] += ' En el M221 Ti = 0 cambia de algoritmo, no anula la integral: mejor usa PI.';
    else if (ctl.startsWith('micro800')) why[1] += ' El Micro800 no admite Ti = 0: carga un Ti muy grande (p. ej. 99999 s).';
    else why[1] += ' En este bloque 0 anula la integral.';
  }
  if (p.Td === 0) {
    const canPid = mode === 'ultimate'
      ? ULTIMATE_RULES[rule].types.includes('PID')
      : ruleTypes(rule, model?.kind).includes('PID');
    why[2] = `D = 0 porque elegiste ${type}. Es lo normal en caudal, presión y nivel: la derivativa amplifica el ruido de la PV.`;
    why[2] += canPid
      ? ' Para un lazo lento y limpio (temperatura) prueba PID en «Controlador».'
      : ' Esta regla no da derivativa; para PID usa Lambda o Ziegler-Nichols.';
  }
  return why;
}

function drawLoad(params, why, label) {
  const box = $('p-load');
  box.hidden = false;
  box.querySelector('.pl-head').textContent = `Para cargar en ${label}`;
  const list = box.querySelector('.pl-rows');
  list.replaceChildren();
  params.forEach(([name, v, unit], i) => {
    const row = document.createElement('div');
    row.className = 'pl-row';
    row.innerHTML = '<span class="pl-role"></span><span class="pl-name"></span>'
      + '<span class="pl-val"><b></b> <small></small></span><button type="button" class="pl-copy">Copiar</button>'
      + '<p class="pl-why"></p>';
    row.querySelector('.pl-role').textContent = ROLES[i];
    row.querySelector('.pl-name').textContent = name;
    row.querySelector('b').textContent = v;
    row.querySelector('small').textContent = unit;
    const w = row.querySelector('.pl-why');
    w.textContent = why[i];
    w.hidden = !why[i];
    row.querySelector('.pl-copy').addEventListener('click', async (e) => {
      // Studio 5000, CCW y Control Expert esperan punto decimal.
      flash(e.currentTarget, (await copyToClipboard(v.replace(',', '.'))) ? 'Copiado ✓' : 'No se pudo');
    });
    list.append(row);
  });
}

// ---------------------------------------------------------------------------
// Gráfico
// ---------------------------------------------------------------------------

function drawPlot(sim) {
  const box = $('p-plot');
  $('p-simcard').hidden = !sim;
  if (!sim) { box.replaceChildren(); return; }
  const W = 320;
  const H = 180;
  const pad = { l: 30, r: 8, t: 8, b: 20 };
  const tMax = sim.t[sim.t.length - 1] || 1;
  const all = [...sim.pv, ...sim.cv, 0, 1].filter(Number.isFinite);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const m = (hi - lo) * 0.05 || 0.1;
  lo -= m; hi += m;
  const x = (t) => pad.l + (t / tMax) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (arr) => arr.map((v, i) => `${x(sim.t[i]).toFixed(1)},${y(Math.max(lo, Math.min(hi, v))).toFixed(1)}`).join(' ');
  const ticks = [0, 1].map((v) => `<text x="${pad.l - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Respuesta simulada de PV y CV">
      <line class="ax" x1="${pad.l}" y1="${y(0)}" x2="${W - pad.r}" y2="${y(0)}"/>
      <line class="sp" x1="${pad.l}" y1="${y(1)}" x2="${W - pad.r}" y2="${y(1)}"/>
      <line class="ax" x1="${x(sim.tLoad)}" y1="${pad.t}" x2="${x(sim.tLoad)}" y2="${H - pad.b}"/>
      <polyline class="cv" points="${line(sim.cv)}"/>
      <polyline class="pv" points="${line(sim.pv)}"/>
      ${ticks}
      <text x="${W - pad.r}" y="${H - 4}" text-anchor="end">${tfmt(tMax, 3)}</text>
      <text x="${x(sim.tLoad) + 3}" y="${H - 4}">carga</text>
    </svg>
    <p class="legend"><span class="k pv"></span>PV <span class="k cv"></span>CV <span class="k sp"></span>consigna</p>`;
}

// ---------------------------------------------------------------------------
// Estado e inicialización
// ---------------------------------------------------------------------------

const snapshot = () => Object.fromEntries(ids.map((id) => [id, $(id).value]));

function applyValues(values) {
  for (const id of ids) {
    if (typeof values[id] !== 'string') continue;
    const el = $(id);
    el.value = values[id];
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.value = defaults[id];
  }
}

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'p');
  // Las tres constantes van en su propio bloque, arriba de la tarjeta: el número grande
  // de la tarjeta mostraría solo una.
  const big = $('p-main').closest('.big');
  big.hidden = true;
  const load = document.createElement('div');
  load.id = 'p-load';
  load.className = 'pid-load';
  load.innerHTML = '<p class="pl-head"></p><div class="pl-rows"></div>';
  big.after(load);
  refreshSelects();

  ids = [...section.querySelectorAll('input, select, textarea')].map((el) => el.id).filter(Boolean);
  for (const id of ids) defaults[id] = $(id).value;

  const tabs = [...section.querySelectorAll('.tabs [data-mode]')];
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

  section.addEventListener('input', render);
  section.addEventListener('change', render);

  $('p-reset').addEventListener('click', () => {
    const before = { mode, values: snapshot() };
    mode = 'step';
    applyValues(defaults);
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { mode = before.mode; applyValues(before.values); render(); },
    });
  });

  const saved = loadState('pid');
  if (saved && typeof saved === 'object') {
    if (['step', 'model', 'ultimate'].includes(saved.mode)) mode = saved.mode;
    if (saved.values && typeof saved.values === 'object') {
      // Las listas de regla y tipo dependen del modo y del proceso: se rellenan antes de aplicar.
      $('p-kind').value = saved.values['p-kind'] || 'self';
      refreshSelects();
      applyValues(saved.values);
      refreshSelects();
      applyValues({ 'p-type': saved.values['p-type'] });
    }
  }
  render();
}
