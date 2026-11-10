// Nivel por presión diferencial con las cotas del tanque como se miden en planta:
// rango del transmisor (LRV/URV), escalado del PLC, zona muerta y esquema.
// La lógica vive en js/level.js (testeada).
import { CONFIGS, DENSITY_UNITS, densityToKgM3, tankRange } from '../../level.js';
import { tankDiagram } from './diagram.js';
import { QUANTITIES, convert } from '../../units.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';
import { mountPicker } from '../densities/picker.js';

const options = (map, def) => Object.entries(map)
  .map(([k, v]) => `<option value="${k}"${k === def ? ' selected' : ''}>${v.label}</option>`).join('');
const num = (id, value = '', signed = false) =>
  `<input id="${id}" type="text" inputmode="decimal"${signed ? ' data-signed' : ''} value="${value}">`;

const TEMPLATE = `
  <div class="card">
    <label>Instalación
      <select id="l-config">${options(CONFIGS, 'open')}</select>
    </label>
    <p id="l-hint" class="hint"></p>
  </div>

  <div class="card">
    <h2>Cotas del tanque</h2>
    <label>Unidad de longitud
      <select id="l-lunit">${options(QUANTITIES.length.units, 'm')}</select>
    </label>
    <p class="hint">Todas las cotas se miden desde la referencia 0 del tanque: el suelo, o el aro donde termina el fondo cónico.</p>
    <div class="row">
      <label>Cota superior (aro del techo) ${num('l-top', '9')}</label>
      <label>Toma HP (o brida del sello) ${num('l-tap', '1')}</label>
    </div>
    <div class="row">
      <label data-need="offset">Transmisor <span class="hint">(vacío = en la toma)</span> ${num('l-xmtr', '', true)}</label>
      <label data-need="taps">Toma LP <span class="hint">(vacío = cota superior)</span> ${num('l-lp', '')}</label>
    </div>
    <label class="check"><input id="l-cone" type="checkbox"> Fondo cónico (solo cambia el dibujo)</label>
  </div>

  <div class="card">
    <h2>Líquido</h2>
    <div class="row">
      <label>Densidad ${num('l-rho', '0,9')}</label>
      <label>Unidad <select id="l-dunit">${options(DENSITY_UNITS, 'SG')}</select></label>
    </div>
    <div data-pick="rho"></div>
    <label data-need="fillHP"><span id="l-fill-label">Densidad del relleno del capilar</span> ${num('l-fill', '0,93')}</label>
    <label data-need="ref">Densidad de la pierna húmeda ${num('l-ref', '1')}</label>
    <div data-need="ref" data-pick="ref"></div>
    <p class="hint">Las densidades del relleno y de la pierna usan la misma unidad. Cambian con la temperatura: usa la de operación.</p>
  </div>

  <div class="card">
    <h2>Transmisor</h2>
    <label>Unidad de presión
      <select id="l-punit">${options(QUANTITIES.pressure.units, 'mbar')}</select>
    </label>
    <div class="row">
      <label>Límite inferior del sensor (opcional) ${num('l-lrl', '', true)}</label>
      <label>Límite superior del sensor (opcional) ${num('l-url', '', true)}</label>
    </div>
    <p class="hint">Si los das, avisa cuando el rango se sale del sensor. Cópialos de la hoja de datos, en la unidad de presión elegida.</p>
  </div>

  <div class="card tank" id="l-tank" aria-live="polite"></div>

  ${resultCardHTML('l', '<div class="actions"><button type="button" id="l-reset">Valores de ejemplo</button></div>')}

  <details class="note">
    <summary>Cómo se calcula</summary>
    <p>El transmisor mide de la toma HP a la cota superior: el 0 % del lazo es la toma y el 100 % la cota superior.
      Por debajo de la toma queda la zona muerta, que no se ve.</p>
    <p>ΔP = P<sub>HP</sub> − P<sub>LP</sub> = g · [ ρ · (nivel − toma) + ρ<sub>HP</sub> · caída − ρ<sub>LP</sub> · altura<sub>LP</sub> ],
      con g = 9,80665 m/s². «Caída» es la distancia de la toma HP al transmisor (positiva si el transmisor está por debajo)
      y «altura LP» la de la toma LP al transmisor.</p>
    <p><b>Supresión de cero</b>: LRV &gt; 0 (por ejemplo, transmisor por debajo de la toma con la línea llena).
      <b>Elevación de cero</b>: LRV &lt; 0 (pierna húmeda, o capilar de la toma superior). El span es ρ · g · (cota superior − toma).</p>
    <p>PLC: el valor real del nivel es el escalado directo toma…cota superior, o el escalado 0…altura medida más el offset
      (la cota de la toma). Con dos sellos remotos y el mismo relleno la cota del transmisor se anula.</p>
  </details>
`;

let ids = [];
const defaults = {};
let showResult = () => {};

const val = (id) => parseNum($(id).value);
const blank = (id) => $(id).value.trim() === '';

function fail(text) {
  $('l-tank').replaceChildren();
  showResult({ value: '—', msgs: [['bad', text]] });
}

const snapshot = () => Object.fromEntries(ids.map((id) => [id, $(id).type === 'checkbox' ? ($(id).checked ? '1' : '0') : $(id).value]));

function applyValues(values) {
  for (const id of ids) {
    if (typeof values[id] !== 'string') continue;
    const el = $(id);
    if (el.type === 'checkbox') { el.checked = values[id] === '1'; continue; }
    el.value = values[id];
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.value = defaults[id];
  }
}

function render() {
  const config = $('l-config').value;
  const cfg = CONFIGS[config];
  $('l-hint').textContent = cfg.hint;
  $('l-fill-label').textContent = config === 'seals' ? 'Densidad del relleno de los capilares' : 'Densidad del relleno del capilar';
  const section = $('l-config').closest('section') || document;
  section.querySelectorAll('[data-need]').forEach((el) => { el.hidden = !cfg[el.dataset.need]; });
  saveState('level2', snapshot());

  const lu = $('l-lunit').value;
  const L = QUANTITIES.length.units[lu].label;
  const toM = (id) => convert('length', val(id), lu, 'm');
  const fromM = (m) => convert('length', m, 'm', lu);
  const optM = (id) => (blank(id) ? undefined : toM(id));
  const dunit = $('l-dunit').value;
  const rho = (id) => densityToKgM3(val(id), dunit);
  const pu = $('l-punit').value;
  const pl = QUANTITIES.pressure.units[pu].label;
  const out = (pa) => convert('pressure', pa, 'Pa', pu);
  const m = (x) => `${fmt(fromM(x), 6)} ${L}`;
  const pct = (x) => `${fmtFixed(x, 1)} %`;

  const xm = cfg.offset ? optM('l-xmtr') : undefined;
  const lp = cfg.taps ? optM('l-lp') : undefined;
  if (xm !== undefined && Number.isNaN(xm)) return fail('Cota del transmisor no válida.');
  if (lp !== undefined && Number.isNaN(lp)) return fail('Cota de la toma LP no válida.');

  let r;
  try {
    r = tankRange({
      config,
      top: toM('l-top'),
      tap: toM('l-tap'),
      xmtr: xm,
      lpTap: lp,
      rho: rho('l-rho'),
      rhoFill: cfg.fillHP ? rho('l-fill') : undefined,
      rhoRef: cfg.ref ? rho('l-ref') : undefined,
    });
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message);
    throw e;
  }

  $('l-tank').innerHTML = tankDiagram({
    top: r.plc.hi,
    tap: r.plc.lo,
    xmtr: r.xmtr,
    lpTap: r.lpTap,
    cone: $('l-cone').checked,
    lpKind: { dry: 'dry', wet: 'wet', seals: 'capillary' }[config] ?? 'none',
    labels: {
      top: `Sup. ${m(r.plc.hi)}`,
      tap: `HP ${m(r.plc.lo)} · ${fmtFixed(r.tapPct, 0)} %`,
      bottom: '0 (ref.)',
      xmtr: `TX ${m(r.xmtr)}`,
      lp: r.lpTap === undefined ? '' : m(r.lpTap),
    },
  });

  const lrv = out(r.lrv);
  const urv = out(r.urv);
  const span = out(r.span);
  const msgs = [];
  if (r.kind === 'suppressed') msgs.push(['ok', 'Cero suprimido: el LRV es positivo. Calibra con el 0 % (4 mA) a ese valor.']);
  else if (r.kind === 'elevated') msgs.push(['ok', 'Cero elevado: el LRV es negativo. Comprueba que el transmisor admite rango negativo (ΔP bidireccional).']);
  else msgs.push(['ok', 'Sin supresión ni elevación: el 0 % del lazo corresponde a ΔP = 0.']);
  if (r.xmtr < r.plc.lo && config !== 'seals' && r.kind !== 'elevated') {
    msgs.push(['ok', 'El transmisor está por debajo de la toma: la línea de impulso llena suma presión en HP, de ahí la supresión.']);
  }
  if (r.lpTap !== undefined && r.lpTap > r.plc.hi) msgs.push(['ok', 'La toma LP queda por encima de la cota superior; se usa su cota real.']);

  const lrl = blank('l-lrl') ? NaN : val('l-lrl');
  const url = blank('l-url') ? NaN : val('l-url');
  if (Number.isFinite(lrl) && Math.min(lrv, urv) < lrl) msgs.push(['bad', `El LRV queda por debajo del límite inferior del sensor (${fmt(lrl)} ${pl}).`]);
  if (Number.isFinite(url) && Math.max(lrv, urv) > url) msgs.push(['bad', `El URV queda por encima del límite superior del sensor (${fmt(url)} ${pl}).`]);
  if (Number.isFinite(url) && url > 0 && span > 0) {
    const td = url / span;
    if (td > 10) msgs.push(['warn', `Turndown ${fmtFixed(td, 1)}:1: con tanta reducción la exactitud del transmisor empeora.`]);
  }

  const col = (x) => `${fmt(fromM(x), 6)} ${L}`;
  const rows = [
    ['LRV (4 mA)', `${fmt(lrv, 6)} ${pl} · ${col(r.column.lrv)} de líquido`],
    ['URV (20 mA)', `${fmt(urv, 6)} ${pl} · ${col(r.column.urv)} de líquido`],
    ['Span', `${fmt(span, 6)} ${pl} · ${col(r.height)} de líquido`],
    ['PLC, escalado directo', `${m(r.plc.lo)} a ${m(r.plc.hi)} (4-20 mA)`],
    ['PLC, escalado + offset', `0 a ${m(r.plc.span)}, más ${m(r.plc.offset)} de offset`],
    ['Zona muerta', `0 a ${m(r.deadZone.height)} · ${pct(r.deadZone.pct)} de la altura del tanque, sin medida`],
    ['Toma HP', `${pct(r.tapPct)} de la altura del tanque`],
    ['Transmisor', `${pct(r.xmtrPct)} de la altura del tanque`],
  ];
  if (r.lpPct !== undefined) rows.push(['Toma LP', `${pct(r.lpPct)} de la altura del tanque`]);
  const mA = (p) => fmtFixed(4 + (16 * p) / 100, 2);
  for (const p of [0, 25, 50, 75, 100]) {
    const a = r.at(p);
    rows.push([`${p} %`, `${fmt(fromM(a.level), 6)} ${L} · ${fmt(out(a.dp), 6)} ${pl} · ${mA(p)} mA`]);
  }

  showResult({
    value: `${fmt(lrv, 6)} … ${fmt(urv, 6)}`,
    unit: pl,
    alt: `${col(r.column.lrv)} … ${col(r.column.urv)} de líquido · ${{ suppressed: 'cero suprimido', elevated: 'cero elevado', none: 'sin supresión' }[r.kind]}`,
    rows,
    msgs,
    text: [cfg.label, ...rows.map(([k, v]) => `${k}: ${v.replaceAll(' · ', ', ')}`)].join('\n'),
  });
}

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'l');

  ids = [...section.querySelectorAll('input, select')].map((el) => el.id).filter(Boolean);
  Object.assign(defaults, snapshot());

  // «Elegir de la tabla»: escribe la densidad en la unidad que esté elegida y recalcula.
  const fill = (fieldId) => (r) => {
    const field = $(fieldId);
    field.value = fmt(r.rho / DENSITY_UNITS[$('l-dunit').value].factor, 6);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return `${field.value} ${DENSITY_UNITS[$('l-dunit').value].label} ✓`;
  };
  mountPicker(section.querySelector('[data-pick="rho"]'), { id: 'l-pick-rho', kind: 'liquid', def: 'crude', apply: fill('l-rho') });
  mountPicker(section.querySelector('[data-pick="ref"]'), { id: 'l-pick-ref', kind: 'liquid', def: 'water', apply: fill('l-ref') });

  section.addEventListener('input', render);
  section.addEventListener('change', render);

  $('l-reset').addEventListener('click', () => {
    const before = snapshot();
    applyValues(defaults);
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { applyValues(before); render(); },
    });
  });

  const saved = loadState('level2');
  if (saved && typeof saved === 'object') applyValues(saved);
  render();
}
