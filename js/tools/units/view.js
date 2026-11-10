// Conversor de unidades. La lógica vive en js/units.js (testeada).
import { QUANTITIES, convertAll } from '../../units.js';
import { parseNum, fmt, $, loadState, saveState } from '../../ui.js';
import { enhanceSigned, copyToClipboard, toast } from '../../components.js';

const TEMPLATE = `
  <div class="card">
    <label>Magnitud
      <select id="u-quantity"></select>
    </label>
    <div class="row">
      <label>Valor
        <input id="u-value" type="text" inputmode="decimal" value="1" autocomplete="off" data-signed>
      </label>
      <label>Unidad
        <select id="u-from"></select>
      </label>
    </div>
    <p id="u-error" class="error" hidden></p>
  </div>
  <table class="results tappable">
    <tbody id="u-results"></tbody>
  </table>
  <p class="hint">Toca una fila para copiar el valor.</p>
  <p id="u-note" class="note"></p>
`;

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  const uq = $('u-quantity');
  const uFrom = $('u-from');
  const uVal = $('u-value');

  for (const [key, q] of Object.entries(QUANTITIES)) uq.add(new Option(q.label, key));

  function fillUnits() {
    const q = QUANTITIES[uq.value];
    uFrom.innerHTML = '';
    for (const [key, u] of Object.entries(q.units)) uFrom.add(new Option(u.label, key));
    $('u-note').textContent = q.note || '';
  }

  function render() {
    const body = $('u-results');
    const err = $('u-error');
    body.innerHTML = '';
    err.hidden = true;
    saveState('units', { quantity: uq.value, from: uFrom.value, value: uVal.value });
    const v = parseNum(uVal.value);
    if (Number.isNaN(v)) {
      if (uVal.value.trim()) {
        err.textContent = 'Número no válido. Usa coma o punto decimal, sin separador de miles (p. ej. 1500,5).';
        err.hidden = false;
      }
      return;
    }
    try {
      for (const r of convertAll(uq.value, v, uFrom.value)) {
        const tr = document.createElement('tr');
        if (r.unit === uFrom.value) tr.className = 'src';
        tr.innerHTML = '<td class="num"></td><td></td>';
        tr.children[0].textContent = fmt(r.value);
        tr.children[1].textContent = r.label;
        tr.tabIndex = 0;
        tr.title = 'Copiar';
        body.appendChild(tr);
      }
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  }

  const saved = loadState('units');
  if (saved && QUANTITIES[saved.quantity]) uq.value = saved.quantity;
  fillUnits();
  if (saved) {
    if (QUANTITIES[uq.value].units[saved.from]) uFrom.value = saved.from;
    if (typeof saved.value === 'string') uVal.value = saved.value;
  }

  uq.addEventListener('change', () => { fillUnits(); render(); });
  uFrom.addEventListener('change', render);
  uVal.addEventListener('input', render);

  // Tocar una fila copia el número (listo para pegar en otro campo o en un informe).
  async function copyRow(tr) {
    const [num, unit] = [...tr.children].map((td) => td.textContent);
    const ok = await copyToClipboard(num);
    toast(ok ? `Copiado: ${num} ${unit}` : 'No se pudo copiar', { ms: 2000 });
  }
  const results = $('u-results');
  results.addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (tr) copyRow(tr); });
  results.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyRow(e.target.closest('tr')); }
  });
  render();
}
