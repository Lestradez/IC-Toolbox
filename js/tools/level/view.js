// Nivel por presión diferencial: LRV y URV con supresión o elevación de cero.
// La lógica vive en js/level.js (testeada).
import { CONFIGS, DENSITY_UNITS, densityToKgM3, levelRange } from '../../level.js';
import { QUANTITIES, convert } from '../../units.js';
import { parseNum, fmt, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned, toast } from '../../components.js';

const options = (map, def) => Object.entries(map)
  .map(([k, v]) => `<option value="${k}"${k === def ? ' selected' : ''}>${v.label}</option>`).join('');
const num = (id, value = '', signed = false) =>
  `<input id="${id}" type="text" inputmode="decimal"${signed ? ' data-signed' : ''} value="${value}">`;

const TEMPLATE = `
  <div class="card">
    <label>Instalación
      <select id="l-config">${options(CONFIGS, 'wet')}</select>
    </label>
    <p id="l-hint" class="hint"></p>
  </div>

  <div class="card">
    <h2>Tanque</h2>
    <label>Unidad de longitud
      <select id="l-lunit">${options(QUANTITIES.length.units, 'mm')}</select>
    </label>
    <p class="hint">Mide todas las cotas desde el mismo origen (por ejemplo, el fondo del tanque).</p>
    <div class="row">
      <label>Nivel al 0 % ${num('l-lo', '0', true)}</label>
      <label>Nivel al 100 % ${num('l-hi', '1500', true)}</label>
    </div>
    <label>Cota de la toma HP (inferior) ${num('l-tap', '0', true)}</label>
    <div class="row">
      <label>Densidad del líquido ${num('l-rho', '0,9')}</label>
      <label>Unidad <select id="l-dunit">${options(DENSITY_UNITS, 'SG')}</select></label>
    </div>
  </div>

  <div class="card" id="l-inst">
    <h2>Instalación</h2>
    <label data-need="offset">Transmisor por debajo (+) o por encima (−) de la toma HP
      ${num('l-off', '0', true)}</label>
    <label data-need="taps">Distancia entre tomas (HP a LP) ${num('l-taps', '1700')}</label>
    <label data-need="fillHP"><span id="l-fill-label">Densidad del relleno del capilar</span> ${num('l-fill', '0,93')}</label>
    <label data-need="ref">Densidad de la pierna húmeda ${num('l-ref', '1')}</label>
    <p class="hint">Las densidades de relleno y de pierna usan la misma unidad que la del líquido.
      Las densidades cambian con la temperatura: usa la de operación.</p>
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

  ${resultCardHTML('l', '<div class="actions"><button type="button" id="l-reset">Valores de ejemplo</button></div>')}

  <details class="note">
    <summary>Cómo se calcula</summary>
    <p>ΔP = P<sub>HP</sub> − P<sub>LP</sub> = g · [ ρ · (nivel − toma) + ρ<sub>HP</sub> · caída − ρ<sub>LP</sub> · altura<sub>LP</sub> ],
      con g = 9,80665 m/s². «Caída» es la distancia de la toma HP al transmisor (positiva si el transmisor está por debajo)
      y «altura LP» la de la toma LP al transmisor.</p>
    <p><b>Supresión de cero</b>: LRV &gt; 0 (por ejemplo, el nivel al 0 % queda por encima de la toma, o el transmisor está por
      debajo con la línea llena). <b>Elevación de cero</b>: LRV &lt; 0 (pierna húmeda, o capilar de la toma superior más pesado).
      El span es siempre ρ · (altura entre el 0 % y el 100 %).</p>
    <p>Con dos sellos remotos y el mismo relleno la cota del transmisor se anula; si los capilares son distintos o están a
      distinta temperatura aparece un error que no se modela aquí.</p>
  </details>
`;

let ids = [];
const defaults = {};
let showResult = () => {};

const val = (id) => parseNum($(id).value);
const point = (pct) => `${pct} %`;

function fail(text) {
  showResult({ value: '—', msgs: [['bad', text]] });
}

function render() {
  const config = $('l-config').value;
  const cfg = CONFIGS[config];
  $('l-hint').textContent = cfg.hint;
  $('l-fill-label').textContent = config === 'seals' ? 'Densidad del relleno de los capilares' : 'Densidad del relleno del capilar';
  const section = $('l-config').closest('section') || document;
  let anyNeed = false;
  section.querySelectorAll('[data-need]').forEach((el) => {
    const on = Boolean(cfg[el.dataset.need]);
    el.hidden = !on;
    anyNeed ||= on;
  });
  $('l-inst').hidden = !anyNeed;

  saveState('level', Object.fromEntries(ids.map((id) => [id, $(id).value])));

  const lu = $('l-lunit').value;
  const toM = (id) => convert('length', val(id), lu, 'm');
  const dunit = $('l-dunit').value;
  const rho = (id) => densityToKgM3(val(id), dunit);
  const pu = $('l-punit').value;
  const pl = QUANTITIES.pressure.units[pu].label;
  const out = (pa) => convert('pressure', pa, 'Pa', pu);

  let r;
  try {
    r = levelRange({
      config,
      lo: toM('l-lo'),
      hi: toM('l-hi'),
      tap: toM('l-tap'),
      rho: rho('l-rho'),
      offset: cfg.offset ? toM('l-off') : 0,
      taps: cfg.taps ? toM('l-taps') : undefined,
      rhoFill: cfg.fillHP ? rho('l-fill') : undefined,
      rhoRef: cfg.ref ? rho('l-ref') : undefined,
    });
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message);
    throw e;
  }

  const lrv = out(r.lrv);
  const urv = out(r.urv);
  const span = out(r.span);
  const msgs = [];
  if (r.kind === 'suppressed') msgs.push(['ok', 'Cero suprimido: el LRV es positivo. Calibra con el 0 % a ese valor.']);
  else if (r.kind === 'elevated') msgs.push(['ok', 'Cero elevado: el LRV es negativo. Comprueba que el transmisor admite rango negativo (ΔP bidireccional).']);
  else msgs.push(['ok', 'Sin supresión ni elevación: el 0 % corresponde a ΔP = 0.']);

  const lrl = $('l-lrl').value.trim() === '' ? NaN : val('l-lrl');
  const url = $('l-url').value.trim() === '' ? NaN : val('l-url');
  if (Number.isFinite(lrl) && Math.min(lrv, urv) < lrl) msgs.push(['bad', `El LRV queda por debajo del límite inferior del sensor (${fmt(lrl)} ${pl}).`]);
  if (Number.isFinite(url) && Math.max(lrv, urv) > url) msgs.push(['bad', `El URV queda por encima del límite superior del sensor (${fmt(url)} ${pl}).`]);
  if (Number.isFinite(url) && url > 0 && span > 0) {
    const td = url / span;
    if (td > 10) msgs.push(['warn', `Turndown ${fmtFixed(td, 1)}:1: con tanta reducción la exactitud del transmisor empeora.`]);
  }

  const rows = [
    ['LRV (0 %)', `${fmt(lrv, 6)} ${pl}`],
    ['URV (100 %)', `${fmt(urv, 6)} ${pl}`],
    ['Span', `${fmt(span, 6)} ${pl}`],
  ];
  const mA = (pct) => fmtFixed(4 + (16 * pct) / 100, 2);
  for (const pct of [0, 25, 50, 75, 100]) {
    const p = r.at(pct);
    rows.push([point(pct), `${fmt(convert('length', p.level, 'm', lu), 6)} ${lu} · ${fmt(out(p.dp), 6)} ${pl} · ${mA(pct)} mA`]);
  }

  showResult({
    value: `${fmt(lrv, 6)} … ${fmt(urv, 6)}`,
    unit: pl,
    alt: `Span ${fmt(span, 6)} ${pl} · ${{ suppressed: 'cero suprimido', elevated: 'cero elevado', none: 'sin supresión' }[r.kind]}`,
    rows,
    msgs,
    text: [`${cfg.label}`, `LRV ${fmt(lrv, 6)} ${pl}, URV ${fmt(urv, 6)} ${pl}, span ${fmt(span, 6)} ${pl}`,
      ...rows.slice(3).map(([k, v]) => `${k}: ${v.replaceAll(' · ', ', ')}`)].join('\n'),
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

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'l');

  ids = [...section.querySelectorAll('input, select')].map((el) => el.id).filter(Boolean);
  for (const id of ids) defaults[id] = $(id).value;

  section.addEventListener('input', render);
  section.addEventListener('change', render);

  $('l-reset').addEventListener('click', () => {
    const before = Object.fromEntries(ids.map((id) => [id, $(id).value]));
    applyValues(defaults);
    render();
    toast('Valores de ejemplo cargados.', {
      action: 'Deshacer',
      onAction: () => { applyValues(before); render(); },
    });
  });

  const saved = loadState('level');
  if (saved && typeof saved === 'object') applyValues(saved);
  render();
}
