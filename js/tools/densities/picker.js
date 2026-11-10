// «Elegir de la tabla»: un desplegable que se pone junto a un campo de densidad (o de gas) de
// otra herramienta, calcula el valor del fluido elegido y lo escribe en el campo al pulsar «Usar».
// El cálculo vive en js/densities.js (testeado).
import { liquidChoices, liquidAt, needsRho15, gasProps, GASES } from '../../densities.js';
import { parseNum, fmt, $, loadState, saveState } from '../../ui.js';
import { enhanceSigned, flash } from '../../components.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const liquidOptionsHTML = (selected) => liquidChoices()
  .map((g) => `<optgroup label="${esc(g.label)}">${g.items
    .map((i) => `<option value="${i.value}"${i.value === selected ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</optgroup>`)
  .join('');

export const gasOptionsHTML = (selected) => GASES
  .map((g) => `<option value="${g.id}"${g.id === selected ? ' selected' : ''}>${esc(g.name)}</option>`).join('');

/**
 * Pone el selector dentro de `host` (un elemento vacío).
 * @param {HTMLElement} host
 * @param {object} o
 * @param {string} o.id       prefijo de ids y clave de memoria (único en la página)
 * @param {'liquid'|'gas'} o.kind
 * @param {string} [o.summary]
 * @param {(r: object) => string} o.apply  recibe el resultado, escribe en la herramienta y devuelve un texto de confirmación
 * @param {() => {T:number, p:number}} [o.context]  gas: T (K) y p (Pa abs) del formulario; lanza RangeError si no son válidas
 * @param {HTMLElement} [o.section]  al editarse esta sección, el resultado de un gas se recalcula
 * @param {string} [o.def]    fluido que se propone al principio
 */
export function mountPicker(host, o) {
  const saved = loadState(`dpick-${o.id}`) || {};
  const first = o.kind === 'gas' ? 'methane' : (o.def || 'water');
  host.innerHTML = `
    <details class="dpick" id="${o.id}">
      <summary>${esc(o.summary || 'Elegir de la tabla')}</summary>
      <div class="dpick-body">
        ${o.kind === 'gas' ? `
        <label>Gas <select id="${o.id}-fluid">${gasOptionsHTML(saved.fluid || first)}</select></label>
        <p class="hint">Usa la presión y la temperatura de este formulario.</p>` : `
        <label>Líquido <select id="${o.id}-fluid">${liquidOptionsHTML(saved.fluid || first)}</select></label>
        <label id="${o.id}-r15box">Densidad a 15 °C (kg/m³)
          <input id="${o.id}-r15" type="text" inputmode="decimal" value="${esc(saved.r15 || '850')}"></label>
        <label>Temperatura (°C)
          <input id="${o.id}-t" type="text" inputmode="decimal" data-signed value="${esc(saved.t || '20')}"></label>`}
        <p class="dpick-out" id="${o.id}-out" aria-live="polite"></p>
        <button type="button" class="dpick-use" id="${o.id}-use">Usar este valor</button>
      </div>
    </details>`;
  enhanceSigned(host);

  const els = {
    fluid: $(`${o.id}-fluid`), r15: $(`${o.id}-r15`), r15box: $(`${o.id}-r15box`), t: $(`${o.id}-t`),
    out: $(`${o.id}-out`), use: $(`${o.id}-use`), det: $(o.id),
  };
  let current = null;

  function compute() {
    current = null;
    els.out.classList.remove('bad');
    try {
      if (o.kind === 'gas') {
        const { T, p } = o.context();
        const g = gasProps(els.fluid.value, T, p);
        current = { kind: 'gas', Z: g.Z, M: g.M, kappa: g.kappa, rho: g.rho, T, p, condensing: g.condensing };
        els.out.textContent = `Z = ${fmt(g.Z, 4)} · M = ${fmt(g.M, 5)} g/mol · κ = ${fmt(g.kappa, 3)} · ρ = ${fmt(g.rho, 4)} kg/m³`
          + (g.condensing ? ' · Cerca de condensar: el valor no es fiable.' : '');
        if (g.condensing) els.out.classList.add('bad');
      } else {
        const choice = els.fluid.value;
        els.r15box.hidden = !needsRho15(choice);
        const r = liquidAt(choice, parseNum(els.t.value), parseNum(els.r15.value));
        current = { kind: 'liquid', ...r };
        els.out.textContent = `ρ = ${fmt(r.rho, 5)} kg/m³`
          + (r.mu !== null ? ` · μ = ${fmt(r.mu, 4)} cP` : '');
      }
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      els.out.textContent = e.message;
      els.out.classList.add('bad');
    }
    els.use.disabled = !current || current.condensing === true;
    saveState(`dpick-${o.id}`, { fluid: els.fluid.value, r15: els.r15?.value, t: els.t?.value });
  }

  host.addEventListener('input', (e) => { e.stopPropagation(); compute(); });
  host.addEventListener('change', (e) => { e.stopPropagation(); compute(); });
  els.det.addEventListener('toggle', () => { if (els.det.open) compute(); });
  o.section?.addEventListener('input', () => { if (els.det.open && o.kind === 'gas') compute(); });
  o.section?.addEventListener('change', () => { if (els.det.open && o.kind === 'gas') compute(); });
  els.use.addEventListener('click', () => {
    compute();
    if (!current || current.condensing) return;
    flash(els.use, o.apply(current) || 'Aplicado ✓');
  });
  compute();
}
