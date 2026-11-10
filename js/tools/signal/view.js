// Escalado de señales: rango de entrada <-> % <-> rango de salida, en cualquier magnitud.
// La lógica vive en js/signal.js (testeada).
import {
  SIGNAL_QUANTITIES, CUSTOM, PRESETS, presetById, matchPreset, convertRange, convertQty,
  scale, unscale, valueAtPercent, percentOfValue, signalStatus, isLoopRange,
} from '../../signal.js';
import { parseNum, fmt, $, loadState, saveState } from '../../ui.js';
import { enhanceSigned } from '../../components.js';

const side = (id, title) => `
  <div class="card">
    <h3 class="card-title">${title}</h3>
    <label>Señal estándar
      <select id="s-${id}-preset"></select>
    </label>
    <div class="row">
      <label>Magnitud
        <select id="s-${id}-qty"></select>
      </label>
      <label>Unidad
        <select id="s-${id}-unit"></select>
        <input id="s-${id}-custom" type="text" maxlength="12" placeholder="p. ej. rpm" hidden>
      </label>
    </div>
    <div class="row">
      <label>Mínimo (0 %)
        <input id="s-${id}-lo" type="text" inputmode="decimal" data-signed>
      </label>
      <label>Máximo (100 %)
        <input id="s-${id}-hi" type="text" inputmode="decimal" data-signed>
      </label>
    </div>
  </div>`;

const TEMPLATE = `
  ${side('a', 'Entrada')}
  ${side('b', 'Salida')}
  <div class="card">
    <label class="check"><input id="s-sqrt" type="checkbox"> Extracción de raíz cuadrada (la salida es √ de la entrada, caudal por ΔP)</label>
  </div>
  <div class="card">
    <p class="hint">Escribe en cualquiera de los tres campos; los otros se recalculan.</p>
    <div class="row">
      <label><span id="s-in-label">Entrada</span>
        <input id="s-in" type="text" inputmode="decimal" data-signed>
      </label>
      <label>Señal (%)
        <input id="s-pct" type="text" inputmode="decimal">
      </label>
      <label><span id="s-out-label">Salida</span>
        <input id="s-out" type="text" inputmode="decimal" data-signed>
      </label>
    </div>
    <p id="s-status" class="status" aria-live="polite"></p>
    <p id="s-error" class="error" hidden></p>
  </div>
  <table class="results">
    <caption>Tabla de calibración (5 puntos)</caption>
    <thead><tr><th>Señal %</th><th id="s-th-in">Entrada</th><th id="s-th-out">Salida</th></tr></thead>
    <tbody id="s-table"></tbody>
  </table>
`;

const SOURCES = { in: 's-in', pct: 's-pct', out: 's-out' };
const STATUS_NAMUR = {
  ok: ['Dentro de rango', 'ok'],
  'bajo-rango': ['Por debajo de 4 mA (saturación NAMUR ≥ 3,8 mA)', 'warn'],
  'sobre-rango': ['Por encima de 20 mA (saturación NAMUR ≤ 20,5 mA)', 'warn'],
  'fallo-bajo': ['Fallo NAMUR NE 43 (≤ 3,6 mA)', 'bad'],
  'fallo-alto': ['Fallo NAMUR NE 43 (≥ 21 mA)', 'bad'],
};
const STATUS_GENERIC = {
  ok: ['Dentro de rango', 'ok'],
  'bajo-rango': ['Por debajo del 0 % del rango de entrada', 'warn'],
  'sobre-rango': ['Por encima del 100 % del rango de entrada', 'warn'],
};

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);

  const el = (s, k) => $(`s-${s}-${k}`);

  // Rellena los selectores y la lista de señales estándar.
  for (const s of ['a', 'b']) {
    const preset = el(s, 'preset');
    preset.add(new Option('Personalizada', ''));
    for (const group of [...new Set(PRESETS.map((p) => p.group))]) {
      const og = document.createElement('optgroup');
      og.label = group;
      for (const p of PRESETS.filter((x) => x.group === group)) og.appendChild(new Option(p.label, p.id));
      preset.appendChild(og);
    }
    const qty = el(s, 'qty');
    for (const [k, q] of Object.entries(SIGNAL_QUANTITIES)) qty.add(new Option(q.label, k));
    qty.add(new Option('Otra (unidad libre)', CUSTOM));
  }

  function fillUnits(s, keep) {
    const qty = el(s, 'qty').value;
    const unit = el(s, 'unit');
    const custom = qty === CUSTOM;
    unit.hidden = custom;
    el(s, 'custom').hidden = !custom;
    unit.innerHTML = '';
    if (!custom) {
      for (const [k, u] of Object.entries(SIGNAL_QUANTITIES[qty].units)) unit.add(new Option(u.label, k));
      if (keep && SIGNAL_QUANTITIES[qty].units[keep]) unit.value = keep;
    }
  }

  /** Estado de un lado: magnitud, unidad (clave), texto de la unidad y rango. */
  function readSide(s) {
    const qty = el(s, 'qty').value;
    const custom = qty === CUSTOM;
    const unit = custom ? CUSTOM : el(s, 'unit').value;
    const label = custom ? el(s, 'custom').value.trim()
      : SIGNAL_QUANTITIES[qty].units[unit].label;
    return { qty, unit, label, lo: parseNum(el(s, 'lo').value), hi: parseNum(el(s, 'hi').value) };
  }

  function setSide(s, { qty, unit, lo, hi, custom }) {
    el(s, 'qty').value = qty;
    fillUnits(s, unit);
    if (custom !== undefined) el(s, 'custom').value = custom;
    el(s, 'lo').value = fmt(lo);
    el(s, 'hi').value = fmt(hi);
  }

  function syncPreset(s) {
    const { qty, unit, lo, hi } = readSide(s);
    el(s, 'preset').value = matchPreset(qty, unit, lo, hi) || '';
  }

  const validRange = (r) => !Number.isNaN(r.lo) && !Number.isNaN(r.hi) && r.lo !== r.hi;
  const unitText = (r) => (r.label ? ` (${r.label})` : '');

  let lastSource = 'in';
  let prevUnit = { a: null, b: null };

  function update(source) {
    const A = readSide('a');
    const B = readSide('b');
    const sqrt = $('s-sqrt').checked;
    const err = $('s-error');
    err.hidden = true;
    $('s-in-label').textContent = `Entrada${unitText(A)}`;
    $('s-out-label').textContent = `Salida${unitText(B)}`;
    $('s-th-in').textContent = `Entrada${unitText(A)}`;
    $('s-th-out').textContent = `Salida${unitText(B)}`;
    if (!validRange(A) || !validRange(B)) {
      err.textContent = 'Introduce un mínimo y un máximo válidos y distintos en la entrada y en la salida.';
      err.hidden = false;
      return;
    }

    let pct;
    if (source === 'in') pct = percentOfValue(parseNum($('s-in').value), A);
    else if (source === 'pct') pct = parseNum($('s-pct').value);
    else pct = unscale(parseNum($('s-out').value), A, B, sqrt).pct;

    if (Number.isNaN(pct)) {
      if ($(SOURCES[source]).value.trim()) {
        err.textContent = 'Número no válido. Usa coma o punto decimal, sin separador de miles.';
        err.hidden = false;
      }
      return;
    }
    const inV = valueAtPercent(pct, A);
    if (source !== 'in') $('s-in').value = fmt(inV);
    if (source !== 'pct') $('s-pct').value = fmt(pct);
    if (source !== 'out') $('s-out').value = fmt(scale(inV, A, B, sqrt).out);

    saveState('signal', {
      v: 2,
      a: { qty: A.qty, unit: A.unit, custom: el('a', 'custom').value, lo: el('a', 'lo').value, hi: el('a', 'hi').value },
      b: { qty: B.qty, unit: B.unit, custom: el('b', 'custom').value, lo: el('b', 'lo').value, hi: el('b', 'hi').value },
      sqrt, source, value: $(SOURCES[source]).value,
    });

    const loop = isLoopRange(A.qty, A.unit, A.lo, A.hi);
    const { status } = signalStatus(pct, { ...A, value: inV });
    const [text, cls] = (loop ? STATUS_NAMUR : STATUS_GENERIC)[status];
    const st = $('s-status');
    st.textContent = text;
    st.className = `status ${cls}`;

    const tbody = $('s-table');
    tbody.innerHTML = '';
    for (const p of [0, 25, 50, 75, 100]) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="num"></td><td class="num"></td><td class="num"></td>';
      const x = valueAtPercent(p, A);
      tr.children[0].textContent = `${p} %`;
      tr.children[1].textContent = fmt(x);
      tr.children[2].textContent = fmt(scale(x, A, B, sqrt).out);
      tbody.appendChild(tr);
    }
  }

  // Preset: fija magnitud, unidad y rango de una vez.
  for (const s of ['a', 'b']) {
    el(s, 'preset').addEventListener('change', () => {
      const p = presetById(el(s, 'preset').value);
      if (!p) return;
      setSide(s, p);
      prevUnit[s] = p.unit;
      update(lastSource);
    });
    // Otra magnitud: unidad inicial de la lista; el rango se conserva como número.
    el(s, 'qty').addEventListener('change', () => {
      fillUnits(s);
      prevUnit[s] = el(s, 'unit').value;
      syncPreset(s);
      update(lastSource);
    });
    // Otra unidad de la misma magnitud: convierte el rango (y el valor escrito de ese lado).
    el(s, 'unit').addEventListener('change', () => {
      const qty = el(s, 'qty').value;
      const from = prevUnit[s];
      const to = el(s, 'unit').value;
      const r = { lo: parseNum(el(s, 'lo').value), hi: parseNum(el(s, 'hi').value) };
      if (from && !Number.isNaN(r.lo) && !Number.isNaN(r.hi)) {
        try {
          const c = convertRange(qty, r, from, to);
          el(s, 'lo').value = fmt(c.lo);
          el(s, 'hi').value = fmt(c.hi);
          const own = s === 'a' ? 'in' : 'out';
          if (lastSource === own) {
            const v = parseNum($(SOURCES[own]).value);
            if (!Number.isNaN(v)) $(SOURCES[own]).value = fmt(convertQty(qty, v, from, to));
          }
        } catch { /* temperatura bajo cero absoluto: se deja el rango como está */ }
      }
      prevUnit[s] = to;
      syncPreset(s);
      update(lastSource);
    });
    for (const k of ['lo', 'hi', 'custom']) {
      el(s, k).addEventListener('input', () => { syncPreset(s); update(lastSource); });
    }
  }
  $('s-sqrt').addEventListener('change', () => update(lastSource));
  for (const [src, id] of Object.entries(SOURCES)) {
    $(id).addEventListener('input', () => { lastSource = src; update(src); });
  }

  // Estado inicial: 4–20 mA -> 0–100 kPa, con 12 mA.
  setSide('a', presetById('4-20mA'));
  setSide('b', { qty: 'pressure', unit: 'kPa', lo: 0, hi: 100 });
  $('s-in').value = '12';

  const saved = loadState('signal');
  const sane = (x) => x && SIGNAL_QUANTITIES[x.qty] ? SIGNAL_QUANTITIES[x.qty].units[x.unit] : x && x.qty === CUSTOM;
  if (saved && saved.v === 2 && sane(saved.a) && sane(saved.b)) {
    for (const s of ['a', 'b']) {
      const d = saved[s];
      el(s, 'qty').value = d.qty;
      fillUnits(s, d.unit);
      if (typeof d.custom === 'string') el(s, 'custom').value = d.custom;
      if (typeof d.lo === 'string') el(s, 'lo').value = d.lo;
      if (typeof d.hi === 'string') el(s, 'hi').value = d.hi;
    }
    $('s-sqrt').checked = !!saved.sqrt;
    if (SOURCES[saved.source] && typeof saved.value === 'string') {
      lastSource = saved.source;
      $(SOURCES[saved.source]).value = saved.value;
    }
  } else if (saved && typeof saved.lrv === 'string') {
    // Formato anterior (solo 4-20 mA con LRV/URV y unidad libre).
    setSide('b', { qty: CUSTOM, unit: CUSTOM, lo: parseNum(saved.lrv) || 0, hi: parseNum(saved.urv) || 100, custom: saved.unit || '' });
    $('s-sqrt').checked = !!saved.sqrt;
    const old = { ma: 'in', pct: 'pct', pv: 'out' }[saved.source];
    if (old && typeof saved.value === 'string') {
      lastSource = old;
      $(SOURCES[old]).value = saved.value;
    }
  }
  for (const s of ['a', 'b']) { prevUnit[s] = el(s, 'unit').value; syncPreset(s); }
  update(lastSource);
}
