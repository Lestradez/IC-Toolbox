// Planilla de calibración: datos del instrumento y del patrón, puntos de subida y bajada
// (as found y as left), guardado en el teléfono y exportación a Excel y PDF.
// Los cálculos y el informe viven en js/calsheet.js (testeado); aquí solo hay interfaz.
import {
  MIN_POINTS, MAX_POINTS, TYPES, VERDICT_TEXT, VERDICT_LEVEL, OUTPUT_PRESETS,
  pointPercents, valueAt, emptyDoc, emptySeries, normalizeDoc, seriesHasData,
  evaluateDoc, buildReport, reportSheet, seriesColumns, finalVerdict, fileBase, fmtDate, unitLabel, outputRange,
} from '../../calsheet.js';
import { SIGNAL_QUANTITIES } from '../../signal.js';
import { xlsx } from '../../xlsx.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';

const DRAFT_KEY = 'calsheet';
const SAVED_KEY = 'calsheet.saved';
const MAX_SAVED = 200;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const text = (k, label, ph = '', attrs = '') =>
  `<label>${label} <input type="text" data-k="${k}" placeholder="${esc(ph)}" autocomplete="off"${attrs}></label>`;
const num = (k, label, ph = '', signed = false) =>
  `<label>${label} <input type="text" inputmode="decimal" data-k="${k}" placeholder="${esc(ph)}"${signed ? ' data-signed' : ''}></label>`;
const date = (k, label) => `<label>${label} <input type="date" data-k="${k}"></label>`;

function unitOptions() {
  const groups = Object.entries(SIGNAL_QUANTITIES).map(([q, def]) =>
    `<optgroup label="${esc(def.label)}">${Object.entries(def.units)
      .map(([u, d]) => `<option value="${q}:${u}">${esc(d.label)}</option>`).join('')}</optgroup>`).join('');
  return `${groups}<optgroup label="Otra"><option value="custom">Otra (escribirla)</option></optgroup>`;
}

const outOptions = () => `${OUTPUT_PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}
  <option value="custom">Otra (escribirla)</option>`;

const pointsOptions = () => Array.from({ length: MAX_POINTS - MIN_POINTS + 1 }, (_, i) => {
  const n = MIN_POINTS + i;
  return `<option value="${n}">${n} (${pointPercents(n).map((p) => fmt(p, 4)).join(' · ')} %)</option>`;
}).join('');

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Sección de la planilla">
    <button type="button" role="tab" data-mode="data">Datos</button>
    <button type="button" role="tab" data-mode="asFound">As found</button>
    <button type="button" role="tab" data-mode="asLeft">As left</button>
    <button type="button" role="tab" data-mode="files">Guardar</button>
  </div>

  <div data-modes="data">
    <div class="card">
      <h2>Instrumento</h2>
      <div class="row">
        ${text('tag', 'TAG', 'p. ej. PT-101')}
        <label>Tipo <select data-k="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      </div>
      ${text('desc', 'Descripción / servicio', 'p. ej. presión de descarga bomba P-3')}
      <div class="row">
        ${text('maker', 'Fabricante')}
        ${text('model', 'Modelo')}
      </div>
      <div class="row">
        ${text('serial', 'Nº de serie')}
        ${text('location', 'Ubicación / área')}
      </div>
    </div>

    <div class="card">
      <h2>Rango y criterio</h2>
      <div class="row">
        <label>Unidad del rango <select data-k="unit">${unitOptions()}</select></label>
        <label data-show="customUnit">Unidad <input type="text" data-k="customUnit" maxlength="16" placeholder="p. ej. kg"></label>
      </div>
      <div class="row">
        ${num('lo', 'LRV (0 %)', '', true)}
        ${num('hi', 'URV (100 %)', '', true)}
      </div>
      <div data-show="transmitter">
        <div class="row">
          <label>Salida <select data-k="out">${outOptions()}</select></label>
          <label data-show="customOut">Unidad de salida <input type="text" data-k="outUnit" maxlength="16"></label>
        </div>
        <div class="row" data-show="customOut">
          ${num('outLo', 'Salida en 0 %', '', true)}
          ${num('outHi', 'Salida en 100 %', '', true)}
        </div>
      </div>
      <div class="row">
        ${num('tol', 'Tolerancia (± % span)', 'p. ej. 0,5')}
        ${num('hystTol', 'Histéresis máx. (% span)', 'opcional')}
      </div>
      <label>Puntos por serie <select data-k="n">${pointsOptions()}</select></label>
      <p class="hint" id="k-points-hint"></p>
    </div>

    <div class="card">
      <h2>Patrón</h2>
      ${text('std.desc', 'Patrón', 'p. ej. calibrador de presión, balanza de pesos muertos')}
      <div class="row">
        ${text('std.maker', 'Marca y modelo')}
        ${text('std.serial', 'Nº de serie')}
      </div>
      <div class="row">
        ${text('std.cert', 'Nº de certificado')}
        ${date('std.due', 'Vencimiento de su calibración')}
      </div>
      <div class="row">
        <label>Incertidumbre U (k = 2), <span id="k-u-unit"></span> <input type="text" inputmode="decimal" data-k="std.U" placeholder="opcional"></label>
        <label data-show="transmitter">U de la medición de salida, <span id="k-uout-unit"></span> <input type="text" inputmode="decimal" data-k="std.outU" placeholder="opcional"></label>
      </div>
      <p class="hint">U sale del certificado de calibración del patrón: es la «incertidumbre expandida» con k = 2
        en el punto de medida (si da varias, usa la mayor del rango). Si el certificado la da en % de la lectura,
        pásala a unidades en el valor más alto. Es opcional: sin ella se acepta con |error| ≤ tolerancia.</p>
    </div>

    <div class="card">
      <h2>Calibración</h2>
      <div class="row">
        ${date('date', 'Fecha')}
        ${text('tech', 'Técnico')}
      </div>
      <div class="row">
        ${text('order', 'Orden de trabajo')}
        ${text('procedure', 'Procedimiento')}
      </div>
      <label>Observaciones <textarea data-k="notes" rows="3"></textarea></label>
    </div>
  </div>

  <div class="card" data-modes="asFound">
    <h2>As found: como se encontró</h2>
    <p class="hint">Antes de tocar nada. Sube de 0 a 100 % y luego baja, sin pasarte de cada punto (si te pasas,
      la histéresis se falsea). «Patrón» vacío = valor nominal del punto.</p>
    <div id="k-pts-asFound" class="cs-pts"></div>
    <div class="actions"><button type="button" data-clear="asFound">Borrar lecturas</button></div>
  </div>

  <div class="card" data-modes="asLeft">
    <h2>As left: como se dejó</h2>
    <p class="hint">Después del ajuste. Si no hizo falta ajustar, copia el as found.</p>
    <div id="k-pts-asLeft" class="cs-pts"></div>
    <div class="actions">
      <button type="button" id="k-copy-found">Copiar as found (sin ajuste)</button>
      <button type="button" data-clear="asLeft">Borrar lecturas</button>
    </div>
  </div>

  <div data-modes="files">
    <div class="card">
      <h2>Esta planilla</h2>
      <p class="hint" id="k-saved-state"></p>
      <div class="actions cs-actions">
        <button type="button" id="k-save">Guardar en este teléfono</button>
        <button type="button" id="k-xlsx">Exportar a Excel</button>
        <button type="button" id="k-pdf">PDF / imprimir</button>
        <button type="button" id="k-new">Nueva planilla</button>
      </div>
      <p class="hint">PDF: en el diálogo de impresión elige «Guardar como PDF». «Nueva planilla» conserva el patrón,
        el técnico, la fecha y el criterio, para seguir con el siguiente instrumento.</p>
    </div>
    <div class="card">
      <h2>Guardadas en este teléfono</h2>
      <ul id="k-list" class="cs-list"></ul>
      <p class="hint">Se guardan en este navegador, sin conexión. Si borras los datos del navegador o desinstalas la
        app se pierden: exporta a Excel o PDF las que tengas que conservar.</p>
    </div>
  </div>

  ${resultCardHTML('k')}

  <details class="note">
    <summary>Cómo se calcula</summary>
    <p>En cada punto, el valor esperado sale del valor del patrón por escalado lineal (en un transmisor, la salida
      que corresponde; en un indicador, el mismo valor). Error = lectura − esperado, en % del span de lo que se lee
      (16 mA en un 4–20 mA). Histéresis = |subida − bajada| en el mismo punto (ISA-51.1).</p>
    <p>Sin U del patrón: cumple si |error| ≤ tolerancia. Con U: la del patrón se lleva a las unidades de la salida
      y se combina con la de la medición de salida (raíz de la suma de cuadrados); cumple si |error| + U ≤ tolerancia,
      no cumple si |error| − U > tolerancia, y en medio queda en zona de duda (ILAC-G8). El resultado final es el del
      as left; si no hay as left, el del as found.</p>
  </details>
`;

let doc = emptyDoc();
let mode = 'data';
let section;
let showResult = () => {};
let signs = '';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((a, k) => a[k], o)[last] = v;
}

const pctText = (x) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtFixed(Math.abs(x), 3)} %` : '—');
const clone = (o) => JSON.parse(JSON.stringify(o));

function loadSaved() {
  const list = loadState(SAVED_KEY);
  return Array.isArray(list) ? list.filter((x) => x && x.doc && typeof x.doc === 'object') : [];
}

// ---------------------------------------------------------------------------
// Puntos
// ---------------------------------------------------------------------------

function rangeSigns() {
  const lo = parseNum(doc.lo);
  const hi = parseNum(doc.hi);
  const neg = (a, b) => Math.min(a, b) < 0;
  const inNeg = neg(lo, hi);
  const outNeg = doc.type === 'transmitter' ? neg(outputRange(doc).lo, outputRange(doc).hi) : inNeg;
  return `${inNeg ? 1 : 0}${outNeg ? 1 : 0}`;
}

/** Crea los campos de los puntos de una serie (al montar, al cambiar n o al abrir otra planilla). */
function buildPoints(key) {
  const box = $(`k-pts-${key}`);
  const [inNeg, outNeg] = signs.split('').map((x) => x === '1');
  const field = (f, i, label, neg) => `<label>${label} <input type="text" inputmode="decimal" autocomplete="off"
    data-s="${key}" data-f="${f}" data-i="${i}"${neg ? ' data-signed' : ''}></label>`;
  box.innerHTML = Array.from({ length: doc.n }, (_, i) => `
    <div class="cs-pt" data-i="${i}">
      <p class="cs-pt-head"><strong data-role="pct"></strong> <span data-role="exp"></span></p>
      <div class="cs-pt-in">
        ${field('applied', i, 'Patrón', inNeg)}
        ${field('up', i, '↑ Subida', outNeg)}
        ${field('down', i, '↓ Bajada', outNeg)}
      </div>
      <p class="cs-pt-res" data-role="res"></p>
    </div>`).join('');
  enhanceSigned(box);
  for (const input of box.querySelectorAll('input[data-s]')) {
    input.value = doc[key][input.dataset.f][Number(input.dataset.i)] ?? '';
  }
}

function buildAllPoints() {
  signs = rangeSigns();
  buildPoints('asFound');
  buildPoints('asLeft');
}

function fillFields() {
  for (const el of section.querySelectorAll('[data-k]')) {
    const v = getPath(doc, el.dataset.k);
    el.value = v ?? '';
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
  }
  buildAllPoints();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderPoints(key, ev) {
  const box = $(`k-pts-${key}`);
  const iu = ev?.ok ? ev.inRange.unit : unitLabel(doc);
  const ou = ev?.ok ? ev.outRange.unit : '';
  const s = ev?.ok ? (key === 'asFound' ? ev.found : ev.left) : null;
  box.querySelectorAll('.cs-pt').forEach((el) => {
    const i = Number(el.dataset.i);
    const pct = pointPercents(doc.n)[i];
    el.querySelector('[data-role="pct"]').textContent = `${fmt(pct, 4)} %`;
    const p = s?.points[i];
    el.querySelector('[data-role="exp"]').textContent = p
      ? `Patrón ${fmt(p.applied, 6)} ${iu} → esperado ${fmt(p.expected, 6)} ${ou}`.replace(/\s+→/, ' →').trim()
      : '';
    const lo = parseNum(doc.lo);
    const hi = parseNum(doc.hi);
    const applied = el.querySelector('[data-f="applied"]');
    applied.placeholder = Number.isFinite(lo) && Number.isFinite(hi) ? fmt(valueAt(pct, lo, hi), 6) : '';
    const res = el.querySelector('[data-role="res"]');
    res.className = 'cs-pt-res';
    if (!p || !p.filled) { res.textContent = ''; return; }
    const parts = [];
    if (Number.isFinite(p.errUpSpan)) parts.push(`↑ ${pctText(p.errUpSpan)}`);
    if (Number.isFinite(p.errDownSpan)) parts.push(`↓ ${pctText(p.errDownSpan)}`);
    if (Number.isFinite(p.hysteresisSpan)) parts.push(`hist. ${fmtFixed(p.hysteresisSpan, 3)} %${p.hystFail ? ' (excede)' : ''}`);
    res.textContent = `${parts.join(' · ')} → ${VERDICT_TEXT[p.verdict] ?? ''}`;
    if (p.verdict) res.classList.add(VERDICT_LEVEL[p.verdict]);
  });
}

function seriesSummary(s) {
  if (!s.filled) return 'Sin datos';
  const parts = [VERDICT_TEXT[s.verdict]];
  if (Number.isFinite(s.maxErrorSpan)) parts.push(`error máx. ${pctText(s.maxErrorSpan)} span`);
  if (Number.isFinite(s.maxHysteresisSpan)) parts.push(`hist. máx. ${fmtFixed(s.maxHysteresisSpan, 3)} %`);
  if (!s.complete) parts.push(`${s.filled} de ${s.points.length} puntos`);
  return parts.join(' · ');
}

function renderSaved() {
  const list = loadSaved();
  const ul = $('k-list');
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = 'Todavía no hay planillas guardadas.';
    ul.append(li);
  }
  for (const item of list) {
    const d = normalizeDoc(item.doc);
    const ev = evaluateDoc(d);
    const v = finalVerdict(ev);
    const li = document.createElement('li');
    if (d.id === doc.id) li.classList.add('on');
    const info = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = d.tag || '(sin TAG)';
    const small = document.createElement('span');
    small.textContent = [fmtDate(d.date), d.desc, v ? VERDICT_TEXT[v] : 'sin lecturas'].filter(Boolean).join(' · ');
    if (v) small.className = VERDICT_LEVEL[v];
    info.append(strong, small);
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Abrir';
    open.addEventListener('click', () => openDoc(item.doc));
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Borrar';
    del.setAttribute('aria-label', `Borrar ${d.tag || 'planilla'}`);
    del.addEventListener('click', () => deleteSaved(d.id));
    li.append(info, open, del);
    ul.append(li);
  }
  const saved = list.find((x) => x.doc.id === doc.id);
  const same = saved && JSON.stringify(normalizeDoc(saved.doc)) === JSON.stringify(doc);
  $('k-saved-state').textContent = saved
    ? (same ? `Guardada el ${new Date(saved.savedAt).toLocaleString('es')}.` : 'Tiene cambios sin guardar.')
    : 'Todavía no está guardada en la lista (el borrador se conserva igual al cerrar la app).';
}

function render() {
  section.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  section.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
  const tx = doc.type === 'transmitter';
  section.querySelectorAll('[data-show="transmitter"]').forEach((el) => { el.hidden = !tx; });
  section.querySelectorAll('[data-show="customUnit"]').forEach((el) => { el.hidden = doc.unit !== 'custom'; });
  section.querySelectorAll('[data-show="customOut"]').forEach((el) => { el.hidden = doc.out !== 'custom'; });

  const iu = unitLabel(doc) || 'unidad del rango';
  $('k-u-unit').textContent = iu;
  $('k-uout-unit').textContent = outputRange(doc).unit || 'unidad de salida';
  $('k-points-hint').textContent = `Patrón en ${pointPercents(doc.n).map((p) => fmt(p, 4)).join(' · ')} % del rango, subiendo y bajando.`;

  if (rangeSigns() !== signs) buildAllPoints();

  const ev = evaluateDoc(doc, today());
  renderPoints('asFound', ev);
  renderPoints('asLeft', ev);
  if (mode === 'files') renderSaved();
  saveState(DRAFT_KEY, { mode, doc });

  if (!ev.ok) {
    showResult({ value: '—', msgs: [['bad', ev.error]] });
    return;
  }
  const v = finalVerdict(ev);
  const msgs = [...ev.warnings];
  if (!ev.found.filled && !ev.left.filled) msgs.push(['ok', 'Carga las lecturas en las pestañas As found y As left.']);
  if (ev.U > 0) msgs.push(['ok', `Regla de decisión ILAC-G8 con U = ±${fmt(ev.U, 3)} ${ev.outRange.unit} (${fmtFixed(ev.found.USpan, 3)} % span).`]);
  else msgs.push(['ok', 'Sin U del patrón: aceptación simple, |error| ≤ tolerancia.']);
  if (v === 'pass-uncertain' || v === 'fail-uncertain') msgs.push(['warn', 'Zona de duda: el error está a menos de U del límite. Conviene ajustar o repetir con un patrón mejor.']);
  if (ev.found.filled && ev.found.verdict !== 'pass' && !ev.left.filled) msgs.push(['warn', 'El as found no cumple: ajusta y carga el as left.']);

  const rows = [
    ['As found', seriesSummary(ev.found)],
    ['As left', seriesSummary(ev.left)],
    ['Tolerancia', `±${fmt(ev.tol)} % span · ±${fmt((ev.tol / 100) * Math.abs(ev.outRange.hi - ev.outRange.lo), 4)} ${ev.outRange.unit}`],
  ];
  if (ev.U > 0) rows.push(['U total (k = 2)', `±${fmt(ev.U, 4)} ${ev.outRange.unit} · TUR ${fmt(ev.found.tur, 2)}:1`]);
  const finalFrom = ev.left.filled ? 'as left' : 'as found';
  showResult({
    value: v ? VERDICT_TEXT[v] : 'Sin lecturas',
    alt: v ? `Resultado del ${finalFrom}${doc.tag ? ` · ${doc.tag}` : ''}` : '',
    rows,
    msgs,
    text: [
      `Calibración ${doc.tag || ''} ${fmtDate(doc.date)}`.trim(),
      `Rango ${fmt(ev.inRange.lo)} a ${fmt(ev.inRange.hi)} ${ev.inRange.unit}${doc.type === 'transmitter' ? `, salida ${fmt(ev.outRange.lo)} a ${fmt(ev.outRange.hi)} ${ev.outRange.unit}` : ''}`,
      ...rows.map(([k, x]) => `${k}: ${x.replaceAll(' · ', ', ')}`),
      `Resultado: ${v ? VERDICT_TEXT[v] : 'sin lecturas'}`,
    ].join('\n'),
  });
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function withUndo(message, change) {
  const before = { mode, doc: clone(doc) };
  change();
  fillFields();
  render();
  toast(message, {
    action: 'Deshacer',
    onAction: () => { doc = before.doc; mode = before.mode; fillFields(); render(); },
  });
}

function openDoc(raw) {
  withUndo(`Planilla ${raw.tag || ''} abierta.`.replace('  ', ' '), () => {
    doc = normalizeDoc(clone(raw));
    mode = 'data';
  });
  scrollTo(0, 0);
}

function saveDoc() {
  const list = loadSaved().filter((x) => x.doc.id !== doc.id);
  list.unshift({ savedAt: Date.now(), doc: clone(doc) });
  saveState(SAVED_KEY, list.slice(0, MAX_SAVED));
  render();
  toast(`Planilla ${doc.tag || ''} guardada en este teléfono.`.replace('  ', ' '));
}

function deleteSaved(id) {
  const list = loadSaved();
  const idx = list.findIndex((x) => x.doc.id === id);
  if (idx < 0) return;
  const [item] = list.splice(idx, 1);
  saveState(SAVED_KEY, list);
  render();
  toast(`Planilla ${item.doc.tag || ''} borrada.`.replace('  ', ' '), {
    action: 'Deshacer',
    onAction: () => {
      const now = loadSaved();
      now.splice(Math.min(idx, now.length), 0, item);
      saveState(SAVED_KEY, now);
      render();
    },
  });
}

function newDoc() {
  withUndo('Planilla nueva (se conservan patrón, técnico y criterio).', () => {
    const keep = ['type', 'unit', 'customUnit', 'lo', 'hi', 'out', 'outUnit', 'outLo', 'outHi', 'tol', 'hystTol', 'n', 'date', 'tech', 'order', 'procedure'];
    const next = emptyDoc();
    for (const k of keep) next[k] = doc[k];
    next.std = clone(doc.std);
    next.asFound = emptySeries(next.n);
    next.asLeft = emptySeries(next.n);
    if (!next.date) next.date = today();
    doc = next;
    mode = 'data';
  });
}

function download(name, bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function currentReport() {
  const ev = evaluateDoc(doc, today());
  if (!ev.ok) { toast(ev.error); return null; }
  return buildReport(doc, ev);
}

function exportXlsx() {
  const report = currentReport();
  if (!report) return;
  download(`${fileBase(doc)}.xlsx`, xlsx([reportSheet(report)]),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = txt;
  return e;
}

/** Informe imprimible (y por tanto «Guardar como PDF»). Todo con textContent. */
export function reportElement(report) {
  const root = el('div', 'cs-report');
  const head = el('header', 'cs-r-head');
  head.append(el('h1', '', report.title));
  if (report.subtitle) head.append(el('p', 'cs-r-sub', report.subtitle));
  const verdict = el('p', `cs-r-verdict ${report.verdict ? VERDICT_LEVEL[report.verdict] : ''}`,
    `Resultado: ${report.verdict ? VERDICT_TEXT[report.verdict] : 'sin lecturas'}`);
  head.append(verdict);
  root.append(head);

  const grid = el('div', 'cs-r-blocks');
  for (const b of report.blocks) {
    const box = el('section', 'cs-r-block');
    box.append(el('h2', '', b.title));
    const t = el('table');
    for (const [k, v] of b.pairs) {
      const tr = el('tr');
      tr.append(el('th', '', k), el('td', '', v || '—'));
      t.append(tr);
    }
    box.append(t);
    grid.append(box);
  }
  root.append(grid);

  for (const s of report.series) {
    const box = el('section', 'cs-r-series');
    box.append(el('h2', '', `${s.title}${s.filled && s.verdict ? `: ${VERDICT_TEXT[s.verdict]}` : ''}`));
    if (!s.filled) {
      box.append(el('p', '', 'Sin datos.'));
    } else {
      const t = el('table', 'cs-r-pts');
      const hr = el('tr');
      for (const c of seriesColumns(s)) hr.append(el('th', '', c));
      const thead = el('thead');
      thead.append(hr);
      t.append(thead);
      const tb = el('tbody');
      for (const p of s.points) {
        const tr = el('tr');
        // Lecturas tal como se escribieron: «12,10» no es «12,1» (dice la resolución).
        const i = s.points.indexOf(p);
        const raw = (f, x) => (Number.isFinite(x) ? String(s.raw?.[f]?.[i] ?? '').trim().replace('.', ',') || fmt(x, 7) : '');
        const cells = [fmt(p.pct, 4), Number.isFinite(parseNum(s.raw?.applied?.[i] ?? '')) ? raw('applied', p.applied) : fmt(p.applied, 6),
          fmt(p.expected, 6), raw('up', p.up), raw('down', p.down),
          pctText(p.errUpSpan), pctText(p.errDownSpan),
          Number.isFinite(p.hysteresisSpan) ? `${fmtFixed(p.hysteresisSpan, 3)} %` : '—'];
        for (const c of cells) tr.append(el('td', 'num', c));
        tr.append(el('td', p.verdict ? VERDICT_LEVEL[p.verdict] : '', p.verdict ? VERDICT_TEXT[p.verdict] : ''));
        tb.append(tr);
      }
      t.append(tb);
      box.append(t);
      box.append(el('p', 'cs-r-max', `Error máximo ${pctText(s.maxErrorSpan)} span · histéresis máxima ${Number.isFinite(s.maxHysteresisSpan) ? `${fmtFixed(s.maxHysteresisSpan, 3)} %` : '—'} span`));
    }
    root.append(box);
  }

  if (report.warnings.length) {
    const box = el('section', 'cs-r-notes');
    box.append(el('h2', '', 'Avisos'));
    const ul = el('ul');
    for (const [, t] of report.warnings) ul.append(el('li', '', t));
    box.append(ul);
    root.append(box);
  }
  if (report.notes?.trim()) {
    const box = el('section', 'cs-r-notes');
    box.append(el('h2', '', 'Observaciones'), el('p', 'cs-r-pre', report.notes));
    root.append(box);
  }
  const sign = el('div', 'cs-r-sign');
  sign.append(el('div', '', 'Realizó (firma y aclaración)'), el('div', '', 'Revisó (firma y aclaración)'));
  root.append(sign);
  root.append(el('p', 'cs-r-foot', 'Generado con I&C Toolbox · lestradez.github.io/IC-Toolbox'));
  return root;
}

function printReport() {
  const report = currentReport();
  if (!report) return;
  let area = $('cs-print');
  if (!area) {
    area = el('div');
    area.id = 'cs-print';
    document.body.append(area);
  }
  area.replaceChildren(reportElement(report));
  const title = document.title;
  document.title = fileBase(doc); // nombre que propone «Guardar como PDF»
  document.body.classList.add('cs-printing');
  const done = () => {
    document.body.classList.remove('cs-printing');
    document.title = title;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

function onInput(e) {
  const t = e.target;
  if (t.dataset.s) {
    doc[t.dataset.s][t.dataset.f][Number(t.dataset.i)] = t.value;
    render();
    return;
  }
  const k = t.dataset.k;
  if (!k) return;
  if (k === 'n') {
    const n = Number(t.value);
    const had = seriesHasData(doc.asFound) || seriesHasData(doc.asLeft);
    const apply = () => {
      doc.n = n;
      doc.asFound = emptySeries(n);
      doc.asLeft = emptySeries(n);
    };
    if (had) withUndo('Cambiaron los puntos: se borraron las lecturas.', apply);
    else { apply(); buildAllPoints(); render(); }
    return;
  }
  setPath(doc, k, t.value);
  render();
}

export function mount(sec) {
  section = sec;
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'k');

  const saved = loadState(DRAFT_KEY);
  if (saved && typeof saved === 'object' && saved.doc) {
    doc = normalizeDoc(saved.doc);
    if (['data', 'asFound', 'asLeft', 'files'].includes(saved.mode)) mode = saved.mode;
  } else {
    doc = emptyDoc();
    doc.date = today();
  }
  fillFields();

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

  section.addEventListener('input', onInput);

  for (const b of section.querySelectorAll('[data-clear]')) {
    b.addEventListener('click', () => withUndo('Lecturas borradas.', () => { doc[b.dataset.clear] = emptySeries(doc.n); }));
  }
  $('k-copy-found').addEventListener('click', () => withUndo('As left = as found.', () => { doc.asLeft = clone(doc.asFound); }));
  $('k-save').addEventListener('click', saveDoc);
  $('k-xlsx').addEventListener('click', exportXlsx);
  $('k-pdf').addEventListener('click', printReport);
  $('k-new').addEventListener('click', newDoc);
  render();
}

