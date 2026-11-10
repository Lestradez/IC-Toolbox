// Densidad de fluidos comunes de proceso: líquidos (con temperatura), petróleo y derivados,
// gases (con presión y temperatura) y vapor saturado. El cálculo vive en js/densities.js.
import {
  liquidAt, liquidById, liquidRange, needsRho15, apiFromRho15, rho15FromApi,
  gasProps, gasById, steamSaturated, STEAM,
} from '../../densities.js';
import { QUANTITIES, convert } from '../../units.js';
import { P_STD } from '../../orifice.js';
import { parseNum, fmt, $, loadState, saveState } from '../../ui.js';
import { resultCardHTML, bindResultCard, enhanceSigned } from '../../components.js';
import { liquidOptionsHTML, gasOptionsHTML } from './picker.js';

const LB_FT3 = 16.01846337396014; // kg/m³ por lb/ft³
const LB_GAL = 119.82642731689663; // kg/m³ por lb/US gal
const AIR_M = 28.9655; // g/mol (aire seco, CoolProp)

const TEMP_UNITS = ['C', 'F', 'K'];
const tempSelect = (id) => `<select id="${id}">${TEMP_UNITS
  .map((u) => `<option value="${u}">${QUANTITIES.temperature.units[u].label}</option>`).join('')}</select>`;
const pressSelect = (id) => `<select id="${id}">${Object.entries(QUANTITIES.pressure.units)
  .map(([k, u]) => `<option value="${k}"${k === 'bar' ? ' selected' : ''}>${u.label}</option>`).join('')}</select>`;

const TEMPLATE = `
  <div class="tabs" role="tablist" aria-label="Tipo de fluido">
    <button type="button" role="tab" data-mode="liquid">Líquidos</button>
    <button type="button" role="tab" data-mode="gas">Gases</button>
    <button type="button" role="tab" data-mode="steam">Vapor</button>
  </div>

  <div class="card" data-modes="liquid">
    <h2>Líquido</h2>
    <label>Fluido <select id="d-fluid">${liquidOptionsHTML('water')}</select></label>
    <div id="d-r15box">
      <label>Densidad conocida
        <span class="combo"><input id="d-r15" type="text" inputmode="decimal" value="850">
          <select id="d-r15u"><option value="rho">kg/m³ a 15 °C</option><option value="api">°API</option></select></span>
      </label>
      <p class="hint">Es la que da el laboratorio o la hoja de datos del producto.</p>
    </div>
    <label>Temperatura
      <span class="combo"><input id="d-t" type="text" inputmode="decimal" data-signed value="20">${tempSelect('d-tu')}</span>
    </label>
    <p id="d-range" class="hint"></p>
  </div>

  <div class="card" data-modes="gas">
    <h2>Gas</h2>
    <label>Gas <select id="d-gas">${gasOptionsHTML('air')}</select></label>
    <label>Temperatura
      <span class="combo"><input id="d-gt" type="text" inputmode="decimal" data-signed value="20">${tempSelect('d-gtu')}</span>
    </label>
    <div class="row">
      <label>Presión
        <span class="combo"><input id="d-gp" type="text" inputmode="decimal" value="1">${pressSelect('d-gpu')}</span>
      </label>
      <label>Referencia
        <select id="d-gref"><option value="g">Manométrica</option><option value="a">Absoluta</option></select>
      </label>
    </div>
    <p class="hint">Manométrica: se suma 1 atm (1,01325 bar).</p>
  </div>

  <div class="card" data-modes="steam">
    <h2>Vapor de agua saturado</h2>
    <div class="row">
      <label>Presión
        <span class="combo"><input id="d-sp" type="text" inputmode="decimal" value="10">${pressSelect('d-spu')}</span>
      </label>
      <label>Referencia
        <select id="d-sref"><option value="g">Manométrica</option><option value="a">Absoluta</option></select>
      </label>
    </div>
    <p class="hint">De ${STEAM.p[0]} a ${STEAM.p[STEAM.p.length - 1]} bar absolutos. Para vapor sobrecalentado usa las tablas de vapor: aquí no se calcula.</p>
  </div>

  ${resultCardHTML('d')}
  <p class="hint" id="d-src"></p>

  <details class="note">
    <summary>De dónde salen los datos y hasta dónde valen</summary>
    <p><b>Líquidos puros y agua</b>: ecuaciones de estado de referencia (IAPWS-95 para el agua), tabuladas cada 5 °C con
      CoolProp e interpoladas con un polinomio cúbico; error de interpolación &lt; 0,1 %. Los orgánicos están a 1 atm; los gases
      licuados (propano, butanos, amoníaco, CO₂) están <b>saturados</b>, es decir, en equilibrio con su vapor a esa temperatura.</p>
    <p><b>Mezclas agua-glicol</b>: modelo de Melinder (IIR, 2010) de CoolProp. Los fabricantes de anticongelante dan tablas
      algo distintas según el inhibidor: para una calibración exacta usa la de tu producto.</p>
    <p><b>Petróleo y derivados</b>: factor de corrección de volumen de API MPMS 11.1 (ASTM D1250) a partir de la densidad a 15 °C.
      Es una aproximación con base en 15 °C; sirve para pasar de la densidad de laboratorio a la de operación, no para
      transferencia de custodia. Un crudo real cambia con su composición y con el agua que arrastra (BSW).</p>
    <p><b>Gases</b>: ecuación de Peng-Robinson. Contra CoolProp, error de densidad ≈ 1 % hasta 10 bar y ≈ 3 % a 40 bar
      (algo más cerca de la saturación, donde se avisa). Es una mezcla pura: para gas natural con cromatografía
      usa AGA8-DC92. El aire es aire seco.</p>
    <p><b>Mercurio</b>: 13 595,08 kg/m³ a 0 °C, con dilatación media de 0 a 100 °C.</p>
    <p>La SG de esta app usa agua = 1000 kg/m³; los °API usan la SG a 60/60 °F con agua a 999,016 kg/m³.
      No hay fluidos de relleno de capilar (silicona, Syltherm, etc.): su densidad depende del fabricante, léela en la hoja del transmisor.</p>
  </details>
`;

let mode = 'liquid';
let ids = [];
let showResult = () => {};
let section = null;

const num = (id) => parseNum($(id).value);
const kelvin = (idV, idU) => convert('temperature', num(idV), $(idU).value, 'K');
const pa = (idV, idU, idRef) => convert('pressure', num(idV), $(idU).value, 'Pa') + ($(idRef).value === 'g' ? P_STD : 0);

function fail(text) {
  showResult({ value: '—', msgs: [['bad', text]] });
  $('d-src').textContent = '';
}

function liquidMode() {
  const choice = $('d-fluid').value;
  const petro = needsRho15(choice);
  $('d-r15box').hidden = !petro;
  const l = liquidById(choice);
  $('d-range').textContent = l ? `Rango de la tabla: ${liquidRange(l).join(' a ')} °C${l.cond === 'sat' ? ' (líquido saturado: la presión sube con la temperatura)' : ''}.` : '';

  const tC = convert('temperature', num('d-t'), $('d-tu').value, 'C');
  let rho15 = num('d-r15');
  if (petro && $('d-r15u').value === 'api') rho15 = rho15FromApi(rho15, choice);
  let r;
  try {
    r = liquidAt(choice, tC, rho15);
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message);
    throw e;
  }
  const rows = [
    ['Densidad relativa SG (agua = 1)', fmt(r.rho / 1000, 5)],
    ['lb/ft³', fmt(r.rho / LB_FT3, 5)],
    ['lb/gal US', fmt(r.rho / LB_GAL, 5)],
  ];
  if (petro) {
    rows.push(['Grupo API', r.name]);
    rows.push(['Densidad a 15 °C', `${fmt(rho15, 5)} kg/m³`]);
    rows.push(['°API', fmt(apiFromRho15(rho15, choice), 4)]);
  }
  if (r.mu !== null) {
    rows.push(['Viscosidad dinámica', `${fmt(r.mu, 4)} cP`]);
    rows.push(['Viscosidad cinemática', `${fmt((r.mu / r.rho) * 1000, 4)} cSt`]);
  }
  const msgs = [];
  if (!petro && choice !== 'mercury' && r.mu === null) msgs.push(['warn', 'Sin viscosidad: no hay una referencia fiable para este fluido.']);
  if (petro) msgs.push(['warn', 'Densidad de un producto de petróleo: es la del modelo API, no la de tu muestra. Verifica con el laboratorio.']);
  const name = r.name;
  showResult({
    value: fmt(r.rho, 5), unit: 'kg/m³', alt: `${name} a ${fmt(tC, 4)} °C`,
    rows, msgs,
    text: `${name} a ${fmt(tC, 4)} °C: ρ = ${fmt(r.rho, 5)} kg/m³`
      + (r.mu !== null ? `, μ = ${fmt(r.mu, 4)} cP` : ''),
  });
  $('d-src').textContent = `Fuente: ${r.source}.`;
}

function gasMode() {
  const T = kelvin('d-gt', 'd-gtu');
  const p = pa('d-gp', 'd-gpu', 'd-gref');
  let r;
  try {
    r = gasProps($('d-gas').value, T, p);
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message);
    throw e;
  }
  const g = gasById($('d-gas').value);
  const msgs = [];
  if (r.condensing) msgs.push(['bad', 'Está cerca de su presión de saturación: el gas puede condensar y este valor no es fiable.']);
  if (p > 41e5) msgs.push(['warn', 'Por encima de 40 bar el error de Peng-Robinson pasa del 3 %: usa una ecuación de estado completa.']);
  if (T < 233.15 || T > 473.15) msgs.push(['warn', 'Fuera de −40…200 °C la comprobación contra CoolProp es escasa.']);
  const rows = [
    ['Factor de compresibilidad Z', fmt(r.Z, 4)],
    ['Masa molar', `${fmt(r.M, 5)} g/mol`],
    ['κ = cp/cv (25 °C, 1 atm)', fmt(r.kappa, 3)],
    ['Densidad relativa (aire = 1)', fmt(r.M / AIR_M, 4)],
    ['Presión absoluta', `${fmt(p / 1e5, 5)} bar`],
  ];
  showResult({
    value: fmt(r.rho, 5), unit: 'kg/m³', alt: `${g.name} a ${fmt(T - 273.15, 4)} °C y ${fmt(p / 1e5, 5)} bar abs`,
    rows, msgs,
    text: `${g.name} a ${fmt(T - 273.15, 4)} °C y ${fmt(p / 1e5, 5)} bar abs: ρ = ${fmt(r.rho, 5)} kg/m³, Z = ${fmt(r.Z, 4)}, M = ${fmt(r.M, 5)} g/mol, κ = ${fmt(r.kappa, 3)}`,
  });
  $('d-src').textContent = `Fuente: ${g.source}; densidad por Peng-Robinson.`;
}

function steamMode() {
  const p = pa('d-sp', 'd-spu', 'd-sref') / 1e5;
  let r;
  try {
    r = steamSaturated(p);
  } catch (e) {
    if (e instanceof RangeError) return fail(e.message);
    throw e;
  }
  showResult({
    value: fmt(r.rhoV, 5), unit: 'kg/m³', alt: `Vapor saturado a ${fmt(p, 5)} bar abs · ${fmt(r.T, 5)} °C`,
    rows: [
      ['Temperatura de saturación', `${fmt(r.T, 5)} °C`],
      ['Volumen específico del vapor', `${fmt(1 / r.rhoV, 5)} m³/kg`],
      ['Densidad del condensado', `${fmt(r.rhoL, 5)} kg/m³`],
    ],
    msgs: [],
    text: `Vapor saturado a ${fmt(p, 5)} bar abs: Tsat = ${fmt(r.T, 5)} °C, ρ = ${fmt(r.rhoV, 5)} kg/m³, ρ condensado = ${fmt(r.rhoL, 5)} kg/m³`,
  });
  $('d-src').textContent = `Fuente: ${STEAM.source}.`;
}

function render() {
  section.querySelectorAll('[data-modes]').forEach((el) => { el.hidden = el.dataset.modes !== mode; });
  section.querySelectorAll('.tabs [data-mode]').forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  saveState('densities', { mode, values: Object.fromEntries(ids.map((id) => [id, $(id).value])) });
  ({ liquid: liquidMode, gas: gasMode, steam: steamMode })[mode]();
}

export function mount(el) {
  section = el;
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  showResult = bindResultCard(section, 'd');
  ids = [...section.querySelectorAll('input, select')].map((x) => x.id).filter(Boolean);

  const saved = loadState('densities');
  if (saved && typeof saved === 'object') {
    if (['liquid', 'gas', 'steam'].includes(saved.mode)) mode = saved.mode;
    for (const [id, v] of Object.entries(saved.values || {})) {
      const x = ids.includes(id) ? $(id) : null;
      if (!x || typeof v !== 'string') continue;
      x.value = v;
      if (x.tagName === 'SELECT' && x.selectedIndex < 0) x.selectedIndex = 0;
    }
  }

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
  render();
}
