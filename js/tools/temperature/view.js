// RTD y termopares: temperatura ↔ Ω / mV, con cables a 2 hilos, junta fría y puntos de
// calibración. La lógica vive en js/temperature.js (testeada contra las tablas).
import {
  RTD_TYPES, TC_TYPES, rtdResistance, rtdTemperature, rtdSensitivity,
  tcEmf, tcSeebeck, tcMeasuredToTemp, tcTempToMeasured,
} from '../../temperature.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Tipo de sensor">
    <button type="button" role="tab" data-mode="rtd">RTD</button>
    <button type="button" role="tab" data-mode="tc">Termopar</button>
  </div>

  <div class="card" data-modes="rtd">
    <h2>RTD</h2>
    <label>Tipo <select id="t-rtd"></select></label>
    <p class="hint">Escribe la temperatura o la resistencia; la otra se recalcula.</p>
    <div class="row">
      <label>Temperatura (°C) <input id="t-rT" type="text" inputmode="decimal" data-signed value="100"></label>
      <label>Resistencia en bornes (Ω) <input id="t-rR" type="text" inputmode="decimal"></label>
    </div>
    <label>Resistencia de los cables, ida + vuelta (Ω) <input id="t-lead" type="text" inputmode="decimal" value="0"></label>
    <p class="hint">Solo a 2 hilos: se suma a la de la RTD. A 3 y 4 hilos el transmisor la compensa: deja 0.
      Referencia: cobre de 1 mm² ≈ 0,018 Ω/m por conductor.</p>
  </div>

  <div class="card" data-modes="tc">
    <h2>Termopar</h2>
    <div class="row">
      <label>Tipo <select id="t-tc"></select></label>
      <label>Junta fría (°C) <input id="t-cj" type="text" inputmode="decimal" data-signed value="25"></label>
    </div>
    <p class="hint">Junta fría = temperatura de los bornes donde el termopar pasa a cobre (transmisor, tarjeta, calibrador).
      Pon 0 para trabajar con la tabla (referencia a 0 °C).</p>
    <p class="hint">Escribe la temperatura o los mV; el otro se recalcula.</p>
    <div class="row">
      <label>Temperatura (°C) <input id="t-tT" type="text" inputmode="decimal" data-signed value="400"></label>
      <label>mV en bornes <input id="t-tE" type="text" inputmode="decimal" data-signed></label>
    </div>
  </div>

  ${resultCardHTML('t', '<div class="actions"><button type="button" id="t-reset">Valores de ejemplo</button></div>')}

  <div class="card">
    <h2>Puntos de calibración</h2>
    <div class="row">
      <label>LRV (°C, 4 mA) <input id="t-lrv" type="text" inputmode="decimal" data-signed value="0"></label>
      <label>URV (°C, 20 mA) <input id="t-urv" type="text" inputmode="decimal" data-signed value="200"></label>
    </div>
    <table class="results">
      <thead><tr><th>%</th><th>mA</th><th>°C</th><th id="t-colX">Ω</th></tr></thead>
      <tbody id="t-table"></tbody>
    </table>
    <p class="hint" id="t-tableHint"></p>
  </div>
`;

const SRC = { rtd: { T: 't-rT', X: 't-rR' }, tc: { T: 't-tT', X: 't-tE' } };

let mode = 'rtd';
const source = { rtd: 'T', tc: 'T' };
let ids = [];
const defaults = {};
let showResult = () => {};

const num = (id) => parseNum($(id).value);
const fT = (t) => fmtFixed(t, 2);
const fR = (r) => fmtFixed(r, 3);
const fE = (e) => fmtFixed(e, 3);
const range = (s) => `${fmt(s.tmin)} a ${fmt(s.tmax)} °C`;

/** Muestra el error y vacía el campo calculado para que no quede un valor viejo a la vista. */
function fail(text, clearId) {
  if (clearId) $(clearId).value = '';
  showResult({ value: '—', msgs: [['bad', text]] });
}

// ---------------------------------------------------------------------------
// RTD
// ---------------------------------------------------------------------------

function renderRTD() {
  const type = $('t-rtd').value;
  const s = RTD_TYPES[type];
  const lead = num('t-lead');
  if (!(lead >= 0)) return fail('Resistencia de cables no válida (≥ 0 Ω).');

  let t;
  let Rs; // resistencia del sensor
  if (source.rtd === 'T') {
    t = num('t-rT');
    if (Number.isNaN(t)) return fail('Temperatura no válida.', 't-rR');
    Rs = rtdResistance(type, t);
    if (Number.isNaN(Rs)) return fail(`Fuera del rango de ${s.label} (${s.std}): ${range(s)}.`, 't-rR');
    $('t-rR').value = fR(Rs + lead);
  } else {
    const Rb = num('t-rR');
    if (Number.isNaN(Rb)) return fail('Resistencia no válida.', 't-rT');
    Rs = Rb - lead;
    t = rtdTemperature(type, Rs);
    if (Number.isNaN(t)) {
      return fail(`${fR(Rs)} Ω fuera del rango de ${s.label}: ${fR(s.R(s.tmin))} a ${fR(s.R(s.tmax))} Ω (${range(s)}).`, 't-rT');
    }
    $('t-rT').value = fT(t);
  }

  const sens = rtdSensitivity(type, t);
  const msgs = [];
  if (lead > 0) {
    msgs.push(['warn', `A 2 hilos los cables añaden ${fR(lead)} Ω ≈ ${fmtFixed(lead / sens, 2)} °C de error si el transmisor no los compensa.`]);
  }
  if (type === 'ni120') msgs.push(['ok', 'Ni120 sin norma IEC: interpolación de la tabla de Minco (α = 0,00672). Comprueba que tu transmisor use la misma curva.']);

  const rows = [
    ['Temperatura', `${fT(t)} °C`],
    ['R del sensor', `${fR(Rs)} Ω`],
  ];
  if (lead > 0) rows.push(['R en bornes (+ cables)', `${fR(Rs + lead)} Ω`]);
  rows.push(
    ['Sensibilidad', `${fmt(sens, 4)} Ω/°C`],
    ['Curva', `${s.label} · R0 = ${fmt(s.R0)} Ω · α = ${fmt(s.alpha)} · ${s.std}`],
    ['Rango', range(s)],
  );

  const main = source.rtd === 'T' ? { value: fR(Rs + lead), unit: 'Ω' } : { value: fT(t), unit: '°C' };
  showResult({
    ...main,
    alt: source.rtd === 'T' ? `a ${fT(t)} °C` : `con ${fR(Rs + lead)} Ω`,
    rows,
    msgs,
    text: `${s.label} (${s.std}): ${fT(t)} °C = ${fR(Rs)} Ω${lead > 0 ? ` (${fR(Rs + lead)} Ω en bornes con ${fR(lead)} Ω de cables)` : ''}`,
  });
}

// ---------------------------------------------------------------------------
// Termopar
// ---------------------------------------------------------------------------

function renderTC() {
  const type = $('t-tc').value;
  const s = TC_TYPES[type];
  const tcj = num('t-cj');
  if (Number.isNaN(tcj)) return fail('Temperatura de junta fría no válida.');
  const Ecj = tcEmf(type, tcj);
  if (Number.isNaN(Ecj)) return fail(`Junta fría fuera del rango del tipo ${type}: ${range(s)}.`);

  let t;
  let Eb; // mV en bornes
  if (source.tc === 'T') {
    t = num('t-tT');
    if (Number.isNaN(t)) return fail('Temperatura no válida.', 't-tE');
    Eb = tcTempToMeasured(type, t, tcj);
    if (Number.isNaN(Eb)) return fail(`Fuera del rango del tipo ${type}: ${range(s)}.`, 't-tE');
    $('t-tE').value = fE(Eb);
  } else {
    Eb = num('t-tE');
    if (Number.isNaN(Eb)) return fail('mV no válidos.', 't-tT');
    t = tcMeasuredToTemp(type, Eb, tcj);
    if (Number.isNaN(t)) {
      const lo = tcEmf(type, s.invMin) - Ecj;
      const hi = tcEmf(type, s.tmax) - Ecj;
      return fail(`${fE(Eb)} mV fuera de rango: con la junta fría a ${fT(tcj)} °C el tipo ${type} va de ${fE(lo)} a ${fE(hi)} mV (${fmt(s.invMin)} a ${fmt(s.tmax)} °C).`, 't-tT');
    }
    $('t-tT').value = fT(t);
  }

  const E = Eb + Ecj;
  const sb = tcSeebeck(type, t);
  const msgs = [];
  if (t < s.lowSens) {
    msgs.push(['warn', `Por debajo de ${fmt(s.lowSens)} °C el tipo ${type} tiene muy poca sensibilidad (${fmt(sb, 3)} µV/°C): la incertidumbre crece mucho.`]);
  }
  if (type === 'B' && tcj > 0) msgs.push(['ok', 'Tipo B: E(junta fría) ≈ 0 entre 0 y 50 °C; la compensación apenas influye.']);
  if (Math.abs(tcj) > 0 && Math.abs(t - tcj) < 1e-9) msgs.push(['ok', 'Proceso a la misma temperatura que la junta fría: 0 mV en bornes.']);

  const rows = [
    ['Temperatura', `${fT(t)} °C`],
    ['mV en bornes', `${fE(Eb)} mV`],
    ['E(t) referida a 0 °C', `${fE(E)} mV`],
    [`E(junta fría, ${fT(tcj)} °C)`, `${fE(Ecj)} mV`],
    ['Sensibilidad (Seebeck)', `${fmt(sb, 4)} µV/°C`],
    ['Conductores', `+ ${s.pos} · − ${s.neg}`],
    ['Rango (ITS-90)', range(s)],
  ];

  const main = source.tc === 'T' ? { value: fE(Eb), unit: 'mV' } : { value: fT(t), unit: '°C' };
  showResult({
    ...main,
    alt: source.tc === 'T' ? `a ${fT(t)} °C, junta fría ${fT(tcj)} °C` : `con ${fE(Eb)} mV, junta fría ${fT(tcj)} °C`,
    rows,
    msgs,
    text: `Termopar ${type}, junta fría ${fT(tcj)} °C: ${fT(t)} °C = ${fE(Eb)} mV en bornes (E = ${fE(E)} mV ref. 0 °C)`,
  });
}

// ---------------------------------------------------------------------------
// Tabla de calibración
// ---------------------------------------------------------------------------

function renderTable() {
  const body = $('t-table');
  body.replaceChildren();
  const lrv = num('t-lrv');
  const urv = num('t-urv');
  const rtd = mode === 'rtd';
  $('t-colX').textContent = rtd ? 'Ω en bornes' : 'mV en bornes';
  const hint = $('t-tableHint');
  if (!Number.isFinite(lrv) || !Number.isFinite(urv) || lrv === urv) {
    hint.textContent = 'Introduce un LRV y un URV válidos y distintos.';
    return;
  }
  const lead = rtd ? Math.max(0, num('t-lead')) || 0 : 0;
  const tcj = num('t-cj');
  hint.textContent = rtd
    ? `${RTD_TYPES[$('t-rtd').value].label}${lead > 0 ? `, con ${fR(lead)} Ω de cables` : ''}. Valores para inyectar con una década o un calibrador.`
    : `Tipo ${$('t-tc').value} con la junta fría a ${fT(tcj)} °C: mV para inyectar con un generador de mV en los bornes del transmisor. Si tu calibrador tiene compensación de junta fría interna, simula directamente en °C.`;
  for (const p of [0, 25, 50, 75, 100]) {
    const t = lrv + (urv - lrv) * p / 100;
    const x = rtd ? rtdResistance($('t-rtd').value, t) + lead : tcTempToMeasured($('t-tc').value, t, tcj);
    const tr = document.createElement('tr');
    for (const v of [`${p}\u00a0%`, fmtFixed(4 + 16 * p / 100, 2), fT(t), Number.isFinite(x) ? (rtd ? fR(x) : fE(x)) : 'fuera de rango']) {
      const td = document.createElement('td');
      td.className = 'num';
      td.textContent = v;
      tr.append(td);
    }
    body.append(tr);
  }
}

// ---------------------------------------------------------------------------
// Render, estado e inicialización
// ---------------------------------------------------------------------------

function render() {
  const view = $('t-rtd').closest('section') || document;
  view.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  view.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
  if (mode === 'rtd') renderRTD(); else renderTC();
  renderTable();
  save();
}

function save() {
  saveState('temperature', {
    mode, source, values: Object.fromEntries(ids.map((id) => [id, $(id).value])),
  });
}

function applyValues(values) {
  for (const id of ids) {
    if (typeof values[id] !== 'string') continue;
    const el = $(id);
    el.value = values[id];
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.value = defaults[id];
  }
}

function load() {
  const o = loadState('temperature');
  if (!o || typeof o !== 'object') return;
  if (o.mode === 'rtd' || o.mode === 'tc') mode = o.mode;
  for (const m of ['rtd', 'tc']) if (o.source?.[m] === 'T' || o.source?.[m] === 'X') source[m] = o.source[m];
  if (o.values && typeof o.values === 'object') applyValues(o.values);
}

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 't');

  for (const [k, s] of Object.entries(RTD_TYPES)) $('t-rtd').add(new Option(`${s.label} (${s.std === 'IEC 60751' ? 'IEC 60751, α 0,00385' : `α ${fmt(s.alpha)}`})`, k));
  for (const [k, s] of Object.entries(TC_TYPES)) $('t-tc').add(new Option(s.label, k));
  $('t-rtd').value = 'pt100';
  $('t-tc').value = 'K';

  ids = [...section.querySelectorAll('input, select')].map((el) => el.id).filter(Boolean);
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

  section.addEventListener('input', (e) => {
    for (const [m, f] of Object.entries(SRC)) {
      if (e.target.id === f.T) source[m] = 'T';
      if (e.target.id === f.X) source[m] = 'X';
    }
    render();
  });
  section.addEventListener('change', render);

  $('t-reset').addEventListener('click', () => {
    const before = { mode, source: { ...source }, values: Object.fromEntries(ids.map((id) => [id, $(id).value])) };
    applyValues(defaults);
    source.rtd = 'T';
    source.tc = 'T';
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { mode = before.mode; Object.assign(source, before.source); applyValues(before.values); render(); },
    });
  });

  load();
  render();
}
