// Señal 4-20 mA ↔ % ↔ valor de proceso. La lógica vive en js/units.js (testeada).
import {
  mAToPercent, percentToMA, percentToPV, pvToPercent, namurStatus,
} from '../../units.js';
import { parseNum, fmt, $, loadState, saveState } from '../../ui.js';

const TEMPLATE = `
  <div class="card">
    <div class="row">
      <label>LRV (0 %)
        <input id="s-lrv" type="text" inputmode="decimal" value="0">
      </label>
      <label>URV (100 %)
        <input id="s-urv" type="text" inputmode="decimal" value="100">
      </label>
      <label>Unidad
        <input id="s-unit" type="text" value="kPa" maxlength="12">
      </label>
    </div>
    <label class="check"><input id="s-sqrt" type="checkbox"> Extracción de raíz cuadrada (caudal por ΔP)</label>
  </div>
  <div class="card">
    <p class="hint">Escribe en cualquiera de los tres campos; los otros se recalculan.</p>
    <div class="row">
      <label>Corriente (mA)
        <input id="s-ma" type="text" inputmode="decimal" value="12">
      </label>
      <label>Señal (%)
        <input id="s-pct" type="text" inputmode="decimal">
      </label>
      <label>Valor de proceso <span id="s-unit-label"></span>
        <input id="s-pv" type="text" inputmode="decimal">
      </label>
    </div>
    <p id="s-status" class="status"></p>
    <p id="s-error" class="error" hidden></p>
  </div>
  <table class="results">
    <caption>Tabla de calibración (5 puntos)</caption>
    <thead><tr><th>Señal %</th><th>mA</th><th>Valor</th></tr></thead>
    <tbody id="s-table"></tbody>
  </table>
`;

const SOURCES = { ma: 's-ma', pct: 's-pct', pv: 's-pv' };

export function mount(section) {
  section.innerHTML = TEMPLATE;
  const sMa = $('s-ma');
  const sPct = $('s-pct');
  const sPv = $('s-pv');

  const STATUS_TEXT = {
    ok: ['Dentro de rango', 'ok'],
    'bajo-rango': ['Por debajo de 4 mA (saturación NAMUR ≥ 3,8 mA)', 'warn'],
    'sobre-rango': ['Por encima de 20 mA (saturación NAMUR ≤ 20,5 mA)', 'warn'],
    'fallo-bajo': ['Fallo NAMUR NE 43 (≤ 3,6 mA)', 'bad'],
    'fallo-alto': ['Fallo NAMUR NE 43 (≥ 21 mA)', 'bad'],
  };

  function range() {
    return { lrv: parseNum($('s-lrv').value), urv: parseNum($('s-urv').value), sqrt: $('s-sqrt').checked };
  }

  function updateSignal(source) {
    const { lrv, urv, sqrt } = range();
    const err = $('s-error');
    err.hidden = true;
    $('s-unit-label').textContent = $('s-unit').value ? `(${$('s-unit').value})` : '';
    if (Number.isNaN(lrv) || Number.isNaN(urv) || lrv === urv) {
      err.textContent = 'Introduce un LRV y un URV válidos y distintos.';
      err.hidden = false;
      return;
    }

    let pct;
    if (source === 'ma') pct = mAToPercent(parseNum(sMa.value));
    else if (source === 'pct') pct = parseNum(sPct.value);
    else pct = pvToPercent(parseNum(sPv.value), lrv, urv, sqrt);

    if (Number.isNaN(pct)) return;
    const mA = percentToMA(pct);
    if (source !== 'ma') sMa.value = fmt(mA);
    if (source !== 'pct') sPct.value = fmt(pct);
    if (source !== 'pv') sPv.value = fmt(percentToPV(pct, lrv, urv, sqrt));

    saveState('signal', {
      lrv: $('s-lrv').value, urv: $('s-urv').value, unit: $('s-unit').value, sqrt: $('s-sqrt').checked,
      source, value: $(SOURCES[source]).value,
    });

    const [text, cls] = STATUS_TEXT[namurStatus(mA)];
    const st = $('s-status');
    st.textContent = text;
    st.className = `status ${cls}`;

    const tbody = $('s-table');
    tbody.innerHTML = '';
    for (const p of [0, 25, 50, 75, 100]) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="num"></td><td class="num"></td><td class="num"></td>';
      tr.children[0].textContent = `${p} %`;
      tr.children[1].textContent = fmt(percentToMA(p));
      tr.children[2].textContent = fmt(percentToPV(p, lrv, urv, sqrt));
      tbody.appendChild(tr);
    }
  }

  let lastSignalSource = 'ma';
  sMa.addEventListener('input', () => { lastSignalSource = 'ma'; updateSignal('ma'); });
  sPct.addEventListener('input', () => { lastSignalSource = 'pct'; updateSignal('pct'); });
  sPv.addEventListener('input', () => { lastSignalSource = 'pv'; updateSignal('pv'); });
  for (const id of ['s-lrv', 's-urv', 's-unit', 's-sqrt']) {
    $(id).addEventListener(id === 's-sqrt' ? 'change' : 'input', () => updateSignal(lastSignalSource));
  }

  const saved = loadState('signal');
  if (saved) {
    for (const k of ['lrv', 'urv', 'unit']) if (typeof saved[k] === 'string') $(`s-${k}`).value = saved[k];
    $('s-sqrt').checked = !!saved.sqrt;
    if (SOURCES[saved.source] && typeof saved.value === 'string') {
      lastSignalSource = saved.source;
      $(SOURCES[saved.source]).value = saved.value;
    }
  }
  updateSignal(lastSignalSource);
}
