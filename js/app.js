import {
  QUANTITIES, convertAll, mAToPercent, percentToMA, percentToPV, pvToPercent, namurStatus,
} from './units.js';
import { parseNum, fmt, $ } from './ui.js';
import { initOrifice } from './orifice-view.js';

// scripts/build.mjs sustituye el marcador por «versión · hash» al publicar.
export const APP_VERSION = '__APP_VERSION__';
document.getElementById('version').textContent = APP_VERSION.startsWith('__') ? 'dev' : APP_VERSION;

// ---------------------------------------------------------------------------
// Router por hash
// ---------------------------------------------------------------------------

function route() {
  const view = (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0];
  let found = false;
  document.querySelectorAll('[data-view]').forEach((el) => {
    const match = el.dataset.view === view;
    el.hidden = !match;
    if (match) found = true;
  });
  if (!found) document.querySelector('[data-view="home"]').hidden = false;
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------------------
// Conversor de unidades
// ---------------------------------------------------------------------------

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

function renderUnits() {
  const body = $('u-results');
  const err = $('u-error');
  body.innerHTML = '';
  err.hidden = true;
  const v = parseNum(uVal.value);
  if (Number.isNaN(v)) return;
  try {
    for (const r of convertAll(uq.value, v, uFrom.value)) {
      const tr = document.createElement('tr');
      if (r.unit === uFrom.value) tr.className = 'src';
      tr.innerHTML = `<td class="num"></td><td></td>`;
      tr.children[0].textContent = fmt(r.value);
      tr.children[1].textContent = r.label;
      body.appendChild(tr);
    }
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

uq.addEventListener('change', () => { fillUnits(); renderUnits(); });
uFrom.addEventListener('change', renderUnits);
uVal.addEventListener('input', renderUnits);
fillUnits();
renderUnits();

// ---------------------------------------------------------------------------
// Señal 4-20 mA
// ---------------------------------------------------------------------------

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
updateSignal('ma');

// ---------------------------------------------------------------------------
// Placa orificio
// ---------------------------------------------------------------------------

initOrifice();

// ---------------------------------------------------------------------------
// Estado de red y service worker
// ---------------------------------------------------------------------------

function updateNet() { $('net').hidden = navigator.onLine; }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
updateNet();

// La versión nueva se instala en segundo plano y espera. Se avisa al usuario y se
// activa cuando pulsa «Actualizar», para no cambiar la app mientras está midiendo.
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let userAccepted = false;

  function offer(worker) {
    if (!sw.controller) return; // primera instalación: no hay nada que actualizar
    $('update').hidden = false;
    $('update-btn').onclick = () => {
      userAccepted = true;
      worker.postMessage('SKIP_WAITING');
    };
  }

  sw.addEventListener('controllerchange', () => {
    if (userAccepted) location.reload();
  });

  window.addEventListener('load', async () => {
    let reg;
    try {
      reg = await sw.register('sw.js');
    } catch (e) {
      console.warn('SW no registrado', e);
      return;
    }
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // En Android la app puede pasar días abierta en segundo plano: al volver, busca versión nueva.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
    });
  });
}
initServiceWorker();
