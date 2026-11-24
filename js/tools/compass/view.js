// Brújula con el magnetómetro del teléfono. La lógica vive en js/sensors.js (testeada).
import { headingFromEvent, smoothAngle, cardinal, trueHeading, normalizeDeg,
  createOrientationSource, SENSOR_PROBLEMS } from '../../sensors.js';
import { parseNum, fmtFixed, $, loadState, saveState } from '../../ui.js';
import { enhanceSigned, copyToClipboard, toast } from '../../components.js';

const TEMPLATE = `
  <p class="warn-box" role="note"><strong>Cuidado con la interferencia.</strong> Motores, variadores, tableros eléctricos,
    cables de potencia, tuberías y estructuras de acero (y un imán en la funda) desvían la aguja decenas de grados. Si el
    rumbo cambia al dar unos pasos, no te fíes de él. Mide lejos de masas metálicas.</p>
  <div class="card">
    <div class="actions">
      <button type="button" id="k-start">Activar brújula</button>
    </div>
    <p id="k-status" class="note" role="status">Pulsa «Activar brújula» (el teléfono pide permiso la primera vez).</p>
    <label>Declinación magnética (°, + este / − oeste) — opcional
      <input id="k-decl" type="text" inputmode="decimal" value="0" autocomplete="off" data-signed>
    </label>
  </div>
  <div class="card compass-card">
    <div class="compass" id="k-compass" role="img" aria-label="Brújula">
      <svg viewBox="-100 -100 200 200" aria-hidden="true">
        <g id="k-dial">
          <circle r="92" class="c-ring"/>
          <g class="c-ticks"></g>
          <text y="-66" class="c-n" text-anchor="middle" dominant-baseline="middle">N</text>
          <text y="70" class="c-l" text-anchor="middle" dominant-baseline="middle">S</text>
          <text x="68" class="c-l" text-anchor="middle" dominant-baseline="middle">E</text>
          <text x="-68" class="c-l" text-anchor="middle" dominant-baseline="middle">O</text>
        </g>
        <path d="M0 -98 L7 -84 L-7 -84 Z" class="c-lubber"/>
      </svg>
    </div>
    <p class="big" aria-live="off"><span id="k-main" class="main">—</span><span id="k-alt" class="alt"></span></p>
    <table class="results kv"><tbody id="k-rows"></tbody></table>
    <ul id="k-msgs" class="msgs"></ul>
    <div class="actions"><button type="button" id="k-copy" disabled>Copiar rumbo</button></div>
  </div>
  <p class="note">Norte <strong>magnético</strong>, no geográfico. Con el teléfono acostado indica hacia dónde apunta su borde
    superior; de pie, hacia dónde mira la cámara trasera.</p>
`;

export function mount(section) {
  section.innerHTML = TEMPLATE;
  enhanceSigned(section);
  const ticks = section.querySelector('.c-ticks');
  for (let a = 0; a < 360; a += 10) {
    const long = a % 90 === 0 ? 0 : a % 30 === 0 ? 8 : 4;
    const rad = (a * Math.PI) / 180;
    const [x1, y1, x2, y2] = [Math.sin(rad) * 92, -Math.cos(rad) * 92, Math.sin(rad) * (92 - 4 - long), -Math.cos(rad) * (92 - 4 - long)];
    if (a % 90 === 0) continue; // ahí van las letras
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) l.setAttribute(k, v.toFixed(1));
    ticks.append(l);
  }

  const declEl = $('k-decl');
  const saved = loadState('compass');
  if (saved && typeof saved.decl === 'string') declEl.value = saved.decl;

  const src = createOrientationSource();
  let h = null;          // rumbo magnético filtrado
  let info = null;       // última lectura (fuente, precisión)
  let running = false;
  let lastPaint = 0;
  let relativeOnly = 0;  // eventos descartados por no ser absolutos

  const decl = () => { const d = parseNum(declEl.value); return Number.isFinite(d) ? d : 0; };
  const setStatus = (t) => { $('k-status').textContent = t; };
  function setRunning(on) { running = on; $('k-start').textContent = on ? 'Detener' : 'Activar brújula'; }

  function paint(force = false) {
    const now = performance.now();
    if (!force && now - lastPaint < 100) return;
    lastPaint = now;
    if (h === null) return;
    const d = decl();
    $('k-dial').style.transform = `rotate(${-h}deg)`;
    $('k-main').textContent = `${fmtFixed(Math.round(h), 0)}° ${cardinal(h)}`;
    $('k-alt').textContent = ' magnético';
    const rows = [['Norte magnético', `${fmtFixed(h, 1)}° ${cardinal(h)}`]];
    if (d !== 0) rows.push([`Norte verdadero (declinación ${d > 0 ? '+' : ''}${fmtFixed(d, 1)}°)`, `${fmtFixed(trueHeading(h, d), 1)}° ${cardinal(trueHeading(h, d))}`]);
    if (info?.accuracy != null) rows.push(['Precisión del sistema', `±${fmtFixed(info.accuracy, 0)}°`]);
    const body = $('k-rows');
    body.replaceChildren();
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = k;
      const b = document.createElement('td'); b.className = 'num'; b.textContent = v;
      tr.append(a, b);
      body.append(tr);
    }
    const msgs = $('k-msgs');
    msgs.replaceChildren();
    if (info?.uncalibrated) {
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = 'El sistema indica que la brújula no está calibrada: gira el teléfono dibujando un ocho en el aire.';
      msgs.append(li);
    }
    $('k-copy').disabled = false;
  }

  function onEvent(e) {
    if (section.hidden) { src.stop(); setRunning(false); return; }
    const r = headingFromEvent(e);
    if (!r) { relativeOnly += 1; if (relativeOnly === 20 && h === null) setStatus('Este teléfono no entrega orientación respecto al norte: la brújula no está disponible aquí.'); return; }
    info = r;
    h = smoothAngle(h, r.heading, 0.3);
    if (h !== null && running) setStatus('Leyendo. Mantén el teléfono horizontal y lejos de masas metálicas.');
    paint();
  }

  $('k-start').addEventListener('click', async () => {
    if (running) { src.stop(); setRunning(false); setStatus('Brújula detenida.'); return; }
    setStatus('Pidiendo permiso…');
    h = null; relativeOnly = 0;
    const r = await src.start(onEvent, () => { setRunning(false); setStatus(SENSOR_PROBLEMS.nodata); }, { absolute: true });
    if (r !== 'ok') { setStatus(SENSOR_PROBLEMS[r]); return; }
    setRunning(true);
    setStatus('Esperando datos de la brújula…');
  });

  declEl.addEventListener('input', () => {
    saveState('compass', { decl: declEl.value });
    paint(true);
  });

  $('k-copy').addEventListener('click', async () => {
    if (h === null) return;
    const d = decl();
    const text = `Norte magnético ${fmtFixed(normalizeDeg(h), 1)}° ${cardinal(h)}` +
      (d !== 0 ? `; verdadero ${fmtFixed(trueHeading(h, d), 1)}° ${cardinal(trueHeading(h, d))} (declinación ${fmtFixed(d, 1)}°)` : '');
    toast((await copyToClipboard(text)) ? `Copiado: ${text}` : 'No se pudo copiar', { ms: 2500 });
  });
}
