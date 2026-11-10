// Estadística de calibración (lecturas repetidas frente a un patrón) y error total probable
// de un transmisor desde su hoja de datos. La lógica vive en js/calibration.js (testeada).
import {
  BASES, CONFIDENCE, parseReadings, calibrationPoint, totalProbableError,
} from '../../calibration.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';

const baseSelect = (id, def) => `<select id="${id}">${Object.entries(BASES)
  .map(([k, l]) => `<option value="${k}"${k === def ? ' selected' : ''}>${l}</option>`).join('')}</select>`;

const num = (id, value = '', signed = false) =>
  `<input id="${id}" type="text" inputmode="decimal"${signed ? ' data-signed' : ''} value="${value}">`;

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Cálculo">
    <button type="button" role="tab" data-mode="stats">Lecturas</button>
    <button type="button" role="tab" data-mode="tpe">Error total (hoja)</button>
  </div>

  <div class="card">
    <h2>Rango calibrado</h2>
    <div class="row">
      <label>LRV (0 %) ${num('c-lo', '0', true)}</label>
      <label>URV (100 %) ${num('c-hi', '10', true)}</label>
      <label>Unidad <input id="c-unit" type="text" maxlength="12" value="bar" placeholder="p. ej. bar"></label>
    </div>
  </div>

  <div class="card" data-modes="stats">
    <h2>Lecturas en un punto</h2>
    <label>Valor del patrón ${num('c-ref', '5', true)}</label>
    <label>Lecturas del instrumento
      <textarea id="c-readings" rows="4" inputmode="decimal" spellcheck="false">5,02 5,03 5,01 5,02 5,02</textarea>
    </label>
    <p class="hint">Separa con espacios, saltos de línea o «;». La coma es decimal.</p>
    <div class="row">
      <label>Incertidumbre del patrón U (k = 2) ${num('c-ustd', '')}</label>
      <label>Tolerancia (± % span) ${num('c-tol', '0,5')}</label>
    </div>
    <p class="hint">U del certificado del calibrador, en la unidad del rango. Déjala vacía si no la tienes:
      entonces solo se evalúa la repetibilidad.</p>
  </div>

  <div class="card" data-modes="tpe">
    <h2>Datos del transmisor</h2>
    <div class="row">
      <label>URL (límite superior del sensor) ${num('c-url', '25')}</label>
      <label>Lectura de trabajo ${num('c-pv', '10', true)}</label>
    </div>
    <p class="hint">Copia de la hoja de datos cada efecto tal cual (sin ±). Los que no apliquen, a 0.</p>

    <fieldset class="comp">
      <legend>Exactitud de referencia</legend>
      <div class="row">
        <label>Valor ${num('c-acc', '0,065')}</label>
        <label>Base ${baseSelect('c-acc-b', 'span')}</label>
      </div>
    </fieldset>
    <fieldset class="comp">
      <legend>Efecto de la temperatura ambiente</legend>
      <div class="row">
        <label>% del URL ${num('c-tu', '0,0125')}</label>
        <label>+ % del span ${num('c-ts', '0,0625')}</label>
      </div>
      <div class="row">
        <label>Por cada ΔT de (°C) ${num('c-tper', '28')}</label>
        <label>ΔT real (°C) ${num('c-treal', '28')}</label>
      </div>
    </fieldset>
    <fieldset class="comp">
      <legend>Efecto de la presión estática</legend>
      <div class="row">
        <label>Valor ${num('c-sp', '0')}</label>
        <label>Base ${baseSelect('c-sp-b', 'url')}</label>
      </div>
      <div class="row">
        <label>Por cada (bar) ${num('c-spper', '69')}</label>
        <label>Presión real (bar) ${num('c-spreal', '69')}</label>
      </div>
      <p class="hint">Solo en transmisores de presión diferencial.</p>
    </fieldset>
    <fieldset class="comp">
      <legend>Estabilidad a largo plazo</legend>
      <div class="row">
        <label>Valor ${num('c-stab', '0,1')}</label>
        <label>Base ${baseSelect('c-stab-b', 'url')}</label>
      </div>
      <div class="row">
        <label>Por cada (años) ${num('c-stper', '5')}</label>
        <label>Entre calibraciones (años) ${num('c-streal', '1')}</label>
      </div>
    </fieldset>
    <fieldset class="comp">
      <legend>Otros (calibrador, tarjeta A/D, indicador…)</legend>
      <div class="row">
        <label>Valor ${num('c-oth', '0')}</label>
        <label>Base ${baseSelect('c-oth-b', 'span')}</label>
      </div>
    </fieldset>
  </div>

  ${resultCardHTML('c', '<div class="actions"><button type="button" id="c-reset">Valores de ejemplo</button></div>')}

  <details class="note" data-modes="stats">
    <summary>Cómo se calcula</summary>
    <p>Error = media de las lecturas − patrón, en % del span (URV − LRV) y en % del valor del patrón.
      s es la desviación típica muestral (n − 1); u<sub>A</sub> = s / √n.
      La incertidumbre expandida U combina u<sub>A</sub> con la del patrón (U/2) y usa el factor k de la
      t de Student para ${fmtFixed(CONFIDENCE * 100, 2)} % con los grados de libertad efectivos
      (Welch-Satterthwaite, GUM anexo G). Con muchas lecturas k → 2.</p>
    <p>Veredicto: «Cumple» si |error| + U cabe en la tolerancia; «No cumple» si |error| − U ya la supera;
      en medio el resultado está en la zona de duda (ILAC-G8).</p>
  </details>
  <details class="note" data-modes="tpe">
    <summary>Cómo se calcula</summary>
    <p>Cada efecto se pasa a unidades (los dos términos de temperatura se suman entre sí) y se escala por
      condición real / condición de la hoja. El error total probable es la raíz de la suma de cuadrados (RSS),
      que supone efectos independientes; el peor caso es la suma lineal.</p>
    <p>Los efectos en % del URL pesan más cuanto mayor es el turndown (URL / span): por eso un transmisor
      muy reducido de rango pierde exactitud.</p>
  </details>
`;

let mode = 'stats';
let ids = [];
const defaults = {};
let showResult = () => {};

const val = (id) => parseNum($(id).value);
/** Valor opcional: vacío = 0. NaN si hay texto que no es número. */
const opt = (id) => ($(id).value.trim() === '' ? 0 : val(id));
const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±');
const signed = (x, f = fmt) => `${sgn(x)}${f(Math.abs(x))}`;
const pct = (x) => (Number.isFinite(x) ? `${fmtFixed(x, x !== 0 && Math.abs(x) < 0.1 ? 4 : 3)} %` : '—');
/** % con signo, para errores. */
const spct = (x) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${pct(Math.abs(x))}` : '—');

function fail(text) {
  showResult({ value: '—', msgs: [['bad', text]] });
}

function readRange() {
  const lo = val('c-lo');
  const hi = val('c-hi');
  const unit = $('c-unit').value.trim();
  if (Number.isNaN(lo) || Number.isNaN(hi) || lo === hi) return null;
  return { lo, hi, unit, u: unit ? ` ${unit}` : '' };
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

const VERDICT = {
  pass: ['ok', 'Cumple: el error más la incertidumbre cabe en la tolerancia.'],
  'pass-uncertain': ['warn', 'Cumple, pero la incertidumbre se sale de la tolerancia: resultado dudoso. Repite o usa un patrón mejor.'],
  'fail-uncertain': ['warn', 'No cumple, pero dentro de la incertidumbre: resultado dudoso. Conviene ajustar.'],
  fail: ['bad', 'No cumple: hay que ajustar el instrumento.'],
};

function renderStats() {
  const R = readRange();
  if (!R) return fail('Introduce un LRV y un URV válidos y distintos.');
  const ref = val('c-ref');
  if (Number.isNaN(ref)) return fail('Valor del patrón no válido.');
  const { values, invalid } = parseReadings($('c-readings').value);
  if (!values.length) return fail('Escribe al menos una lectura.');
  const uStd = opt('c-ustd');
  const tol = opt('c-tol');
  if (Number.isNaN(uStd) || uStd < 0) return fail('Incertidumbre del patrón no válida (≥ 0).');
  if (Number.isNaN(tol) || tol < 0) return fail('Tolerancia no válida (≥ 0).');

  const r = calibrationPoint({ readings: values, ref, lo: R.lo, hi: R.hi, uStd, tol });
  const u = R.u;
  const msgs = [];
  if (invalid.length) msgs.push(['warn', `Ignorado (no es un número): ${invalid.join(' ')}`]);
  if (r.verdict) msgs.push(VERDICT[r.verdict]);
  if (r.n < 2) msgs.push(['warn', 'Con una sola lectura no hay desviación típica ni incertidumbre tipo A.']);
  else if (r.n < 5) msgs.push(['warn', `Solo ${r.n} lecturas: k = ${fmtFixed(r.k, 2)} infla mucho la incertidumbre. Con 10 o más baja hacia 2.`]);
  if (!uStd) msgs.push(['ok', 'Sin la incertidumbre del patrón, U solo refleja la repetibilidad.']);
  if (ref === 0) msgs.push(['ok', 'Patrón en 0: el error en % de la lectura no está definido.']);

  const rows = [
    ['Lecturas (n)', String(r.n)],
    ['Media', `${fmt(r.mean, 7)}${u}`],
    ['Error medio', `${signed(r.error)}${u} · ${spct(r.errorSpan)} span · ${spct(r.errorReading)} lectura`],
    ['Peor lectura', `${signed(r.worst)}${u} · ${spct(r.worstSpan)} span`],
    ['Mín · máx', `${fmt(r.min, 7)} · ${fmt(r.max, 7)}${u}`],
  ];
  if (r.n > 1) {
    rows.push(
      ['Desv. típica s (n − 1)', `${fmt(r.s, 4)}${u} · ${pct(r.sSpan)} span`],
      ['σ poblacional (n)', `${fmt(r.sigmaPop, 4)}${u}`],
      ['u tipo A = s/√n', `${fmt(r.uA, 4)}${u}`],
    );
  }
  if (r.uB) rows.push(['u del patrón = U/2', `${fmt(r.uB, 4)}${u}`]);
  if (Number.isFinite(r.U)) {
    rows.push(
      ['u combinada', `${fmt(r.uc, 4)}${u}`],
      ['ν efectivos · k', `${r.nuEff === Infinity ? '∞' : r.nuEff} · ${fmtFixed(r.k, 3)}`],
      [`U (${fmtFixed(CONFIDENCE * 100, 2)} %)`, `±${fmt(r.U, 4)}${u} · ${pct(r.USpan)} span`],
    );
  }
  if (tol > 0) rows.push(['Tolerancia', `±${fmt(r.tolAbs)}${u} · ±${pct(tol)} span`]);

  const value = `${sgn(r.errorSpan)}${fmtFixed(Math.abs(r.errorSpan), 3)}`;
  const alt = `Error medio ${signed(r.error)}${u}${Number.isFinite(r.U) ? ` · U = ±${fmt(r.U, 3)}${u}` : ''}`;
  showResult({
    value,
    unit: '% span',
    alt,
    rows,
    msgs,
    text: [`Calibración ${fmt(R.lo)}–${fmt(R.hi)}${u}, patrón ${fmt(ref)}${u}`, `Lecturas: ${values.map((x) => fmt(x, 7)).join('; ')}`,
      ...rows.map(([k, v]) => `${k}: ${v.replaceAll(' · ', ', ')}`),
      ...(r.verdict ? [VERDICT[r.verdict][1]] : [])].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// Error total probable
// ---------------------------------------------------------------------------

/** Factor real / hoja. Vacíos → 1. */
function factor(perId, realId) {
  const per = $(perId).value.trim();
  const real = $(realId).value.trim();
  if (!per && !real) return 1;
  const p = parseNum(per);
  const r = parseNum(real);
  return p > 0 && r >= 0 ? r / p : NaN;
}

function renderTPE() {
  const R = readRange();
  if (!R) return fail('Introduce un LRV y un URV válidos y distintos.');
  const url = opt('c-url');
  const pv = $('c-pv').value.trim() === '' ? NaN : val('c-pv');
  if (Number.isNaN(url) || url < 0) return fail('URL no válido (≥ 0).');

  const comps = [
    { name: 'Exactitud de referencia', terms: [{ value: opt('c-acc'), base: $('c-acc-b').value }] },
    { name: 'Temperatura ambiente', terms: [{ value: opt('c-tu'), base: 'url' }, { value: opt('c-ts'), base: 'span' }], factor: factor('c-tper', 'c-treal') },
    { name: 'Presión estática', terms: [{ value: opt('c-sp'), base: $('c-sp-b').value }], factor: factor('c-spper', 'c-spreal') },
    { name: 'Estabilidad', terms: [{ value: opt('c-stab'), base: $('c-stab-b').value }], factor: factor('c-stper', 'c-streal') },
    { name: 'Otros', terms: [{ value: opt('c-oth'), base: $('c-oth-b').value }] },
  ];
  for (const c of comps) {
    if (c.terms.some((t) => Number.isNaN(t.value))) return fail(`${c.name}: valor no válido.`);
    if (Number.isNaN(c.factor)) return fail(`${c.name}: la condición de la hoja debe ser > 0 y la real ≥ 0.`);
  }

  const r = totalProbableError(comps, { lo: R.lo, hi: R.hi, url: url || NaN, reading: pv });
  const u = R.u;
  const msgs = [];
  for (const name of r.missing) {
    const usesUrl = comps.find((c) => c.name === name).terms.some((t) => t.base === 'url' && t.value);
    msgs.push(['bad', `${name}: falta ${usesUrl ? 'el URL' : 'la lectura de trabajo'}; no se ha sumado.`]);
  }
  const span = Math.abs(R.hi - R.lo);
  if (url > 0 && url < Math.max(Math.abs(R.lo), Math.abs(R.hi))) msgs.push(['warn', 'El rango calibrado supera el URL: revisa los datos.']);
  if (r.turndown > 10) msgs.push(['warn', `Turndown ${fmtFixed(r.turndown, 1)}:1. Revisa en la hoja si la exactitud de referencia empeora por encima de cierto turndown.`]);
  if (!r.parts.length) msgs.push(['warn', 'Todos los efectos están a 0.']);
  msgs.push(['ok', 'RSS supone efectos independientes. Para un margen garantizado usa el peor caso.']);

  const rows = r.parts.map((p) => [p.name, `±${fmt(p.abs, 4)}${u} · ${pct(p.span)} span`]);
  rows.push(
    ['Error total probable (RSS)', `±${fmt(r.rss, 4)}${u} · ${pct(r.rssSpan)} span${Number.isFinite(r.rssReading) ? ` · ${pct(r.rssReading)} lectura` : ''}`],
    ['Peor caso (suma)', `±${fmt(r.worst, 4)}${u} · ${pct(r.worstSpan)} span${Number.isFinite(r.worstReading) ? ` · ${pct(r.worstReading)} lectura` : ''}`],
  );
  if (Number.isFinite(r.turndown)) rows.push(['Turndown (URL / span)', `${fmtFixed(r.turndown, 2)}:1`]);

  showResult({
    value: `±${fmtFixed(r.rssSpan, 3)}`,
    unit: '% span',
    alt: `±${fmt(r.rss, 4)}${u} (RSS) · peor caso ±${fmt(r.worst, 4)}${u}`,
    rows,
    msgs,
    text: [`Error total probable, rango ${fmt(R.lo)}–${fmt(R.hi)}${u} (span ${fmt(span)}${u})${url ? `, URL ${fmt(url)}${u}` : ''}`,
      ...rows.map(([k, v]) => `${k}: ${v.replaceAll(' · ', ', ')}`)].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// Render, estado e inicialización
// ---------------------------------------------------------------------------

function render() {
  const view = $('c-lo').closest('section') || document;
  view.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  view.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
  if (mode === 'stats') renderStats(); else renderTPE();
  saveState('calibration', { mode, values: snapshot() });
}

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
  showResult = bindResultCard(section, 'c');

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

  $('c-reset').addEventListener('click', () => {
    const before = { mode, values: snapshot() };
    applyValues(defaults);
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { mode = before.mode; applyValues(before.values); render(); },
    });
  });

  const saved = loadState('calibration');
  if (saved && typeof saved === 'object') {
    if (saved.mode === 'stats' || saved.mode === 'tpe') mode = saved.mode;
    if (saved.values && typeof saved.values === 'object') applyValues(saved.values);
  }
  render();
}
