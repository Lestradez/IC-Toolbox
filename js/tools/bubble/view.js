// Nivel de burbuja con el acelerómetro del teléfono. La lógica vive en js/sensors.js (testeada).
import { LEVEL_MODES, readInclination, upVector, rotateForScreen, slope, isLevel, lowPass,
  createOrientationSource, SENSOR_PROBLEMS, LEVEL_TOLERANCE_DEG } from '../../sensors.js';
import { fmtFixed, $, loadState, saveState } from '../../ui.js';
import { copyToClipboard, toast } from '../../components.js';

const TEMPLATE = `
  <div class="card">
    <label>Posición del teléfono
      <select id="b-mode"></select>
    </label>
    <div class="actions">
      <button type="button" id="b-start">Activar sensores</button>
      <button type="button" id="b-hold" disabled>Congelar</button>
    </div>
    <p id="b-status" class="note" role="status">Pulsa «Activar sensores» (el teléfono pide permiso la primera vez).</p>
  </div>
  <div class="card vial-card">
    <div class="vial" id="b-vial" role="img" aria-label="Burbuja de nivel">
      <span class="vial-ring"></span><span class="vial-cross"></span><span class="vial-bubble" id="b-bubble"></span>
    </div>
    <p class="big" aria-hidden="true"><span id="b-main" class="main">—</span></p>
    <p id="b-verdict" class="vial-verdict" role="status"></p>
    <table class="results kv"><tbody id="b-rows"></tbody></table>
    <ul id="b-msgs" class="msgs"></ul>
    <div class="actions">
      <button type="button" id="b-zero" disabled>Poner a cero aquí</button>
      <button type="button" id="b-unzero" hidden>Quitar cero</button>
      <button type="button" id="b-copy" disabled>Copiar lectura</button>
    </div>
  </div>
  <p class="note">Precisión típica de un teléfono: ±0,5°. Sirve para pendientes y plomadas de campo, no para alineaciones de precisión. Apoya el teléfono sin funda gruesa y sin objetos debajo.</p>
`;

const MAX_DEG = 5; // el borde del vial corresponde a ±5°

export function mount(section) {
  section.innerHTML = TEMPLATE;
  const modeSel = $('b-mode');
  for (const [k, m] of Object.entries(LEVEL_MODES)) modeSel.add(new Option(m.label, k));

  const saved = loadState('bubble') || {};
  if (LEVEL_MODES[saved.mode]) modeSel.value = saved.mode;
  const zeros = { flat: { a: 0, b: 0 }, upright: { a: 0, b: 0 }, ...(saved.zeros || {}) };

  const src = createOrientationSource();
  let up = null;        // último vector «arriba» filtrado
  let running = false;
  let held = false;
  let last = null;      // última lectura mostrada (para copiar)
  let lastPaint = 0;

  const save = () => saveState('bubble', { mode: modeSel.value, zeros });
  const zeroNow = () => zeros[modeSel.value];
  const hasZero = () => zeroNow().a !== 0 || zeroNow().b !== 0;

  function setStatus(text) { $('b-status').textContent = text; }
  function setRunning(on) {
    running = on;
    $('b-start').textContent = on ? 'Detener' : 'Activar sensores';
    for (const id of ['b-hold', 'b-zero']) $(id).disabled = !on;
    if (!on) { held = false; $('b-hold').textContent = 'Congelar'; }
  }

  function paint(force = false) {
    const now = performance.now();
    if (!force && now - lastPaint < 100) return; // ~10 lecturas por segundo bastan
    lastPaint = now;
    $('b-unzero').hidden = !hasZero();
    if (!up) return;
    const mode = modeSel.value;
    const r = readInclination(up, mode, zeroNow());
    last = { mode, ...r };
    const level = isLevel(r.total);
    const pos = (deg) => Math.max(-1, Math.min(1, deg / MAX_DEG)) * 42; // % del lado del vial
    // La burbuja sube al lado más alto: a la derecha si a > 0, arriba si b > 0.
    $('b-bubble').style.left = `${50 + pos(r.a)}%`;
    $('b-bubble').style.top = `${50 - pos(r.b)}%`;
    $('b-vial').dataset.level = level ? 'ok' : 'off';
    $('b-main').textContent = `${fmtFixed(r.total, 1)}°`;
    $('b-verdict').textContent = held ? 'Congelado' : level ? `Nivelado (dentro de ±${fmtFixed(LEVEL_TOLERANCE_DEG, 1)}°)` : 'Fuera de nivel';
    $('b-verdict').dataset.level = level ? 'ok' : 'off';
    const m = LEVEL_MODES[mode];
    const sa = slope(r.a), sb = slope(r.b);
    const sgn = (v, d) => (v > 0 ? '+' : '') + fmtFixed(v, d);
    const rows = [
      [m.a, `${sgn(r.a, 1)}° · ${sgn(sa.pct, 1)} % · ${sgn(sa.mmPerM, 0)} mm/m`],
      [m.b, `${sgn(r.b, 1)}° · ${sgn(sb.pct, 1)} % · ${sgn(sb.mmPerM, 0)} mm/m`],
    ];
    const body = $('b-rows');
    body.replaceChildren();
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const td0 = document.createElement('td'); td0.textContent = k;
      const td1 = document.createElement('td'); td1.className = 'num';
      for (const part of v.split(' · ')) { const s = document.createElement('span'); s.textContent = part; td1.append(s); }
      tr.append(td0, td1);
      body.append(tr);
    }
    const msgs = $('b-msgs');
    msgs.replaceChildren();
    if (r.faceDown) {
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = mode === 'flat' ? 'El teléfono está boca abajo: los signos de la lectura se invierten.' : 'El teléfono está boca abajo.';
      msgs.append(li);
    }
    $('b-copy').disabled = false;
  }

  function onEvent(e) {
    // Si el usuario salió de la herramienta, se dejan de leer los sensores.
    if (section.hidden) { src.stop(); setRunning(false); return; }
    if (held || typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;
    const raw = upVector(e.beta, e.gamma);
    const ang = (typeof screen !== 'undefined' && screen.orientation && screen.orientation.angle) || 0;
    const [x, y] = rotateForScreen([raw[0], raw[1]], ang);
    const v = [x, y, raw[2]];
    up = up ? up.map((p, i) => lowPass(p, v[i], 0.35)) : v;
    paint();
  }

  $('b-start').addEventListener('click', async () => {
    if (running) { src.stop(); setRunning(false); setStatus('Sensores detenidos.'); return; }
    setStatus('Pidiendo permiso…');
    const r = await src.start(onEvent, () => { setRunning(false); setStatus(SENSOR_PROBLEMS.nodata); });
    if (r !== 'ok') { setStatus(SENSOR_PROBLEMS[r]); return; }
    setRunning(true);
    setStatus('Leyendo. Apoya el teléfono y espera a que la lectura se estabilice.');
  });

  $('b-hold').addEventListener('click', () => {
    held = !held;
    $('b-hold').textContent = held ? 'Seguir' : 'Congelar';
    paint(true);
  });

  modeSel.addEventListener('change', () => { save(); paint(true); });

  // Cero: la lectura actual (sin cero) pasa a ser 0°. Sirve para anular una funda o una superficie
  // que no es de referencia; ver «prueba de giro de 180°» en la ayuda.
  $('b-zero').addEventListener('click', () => {
    if (!up) return;
    const r = readInclination(up, modeSel.value);
    zeros[modeSel.value] = { a: r.rawA, b: r.rawB };
    save(); paint(true);
    toast('Cero puesto con la posición actual', { ms: 2000 });
  });
  $('b-unzero').addEventListener('click', () => {
    zeros[modeSel.value] = { a: 0, b: 0 };
    save(); paint(true);
  });

  $('b-copy').addEventListener('click', async () => {
    if (!last) return;
    const f = (v) => fmtFixed(v, 1);
    const m = LEVEL_MODES[last.mode];
    const text = `${m.a}: ${f(last.a)}°; ${m.b}: ${f(last.b)}°; total ${f(last.total)}°`;
    toast((await copyToClipboard(text)) ? `Copiado: ${text}` : 'No se pudo copiar', { ms: 2500 });
  });
}
