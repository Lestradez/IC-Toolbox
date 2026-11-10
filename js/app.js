// Carcasa de la app: cabecera, inicio con buscador, router por hash, tema y service worker.
// Cada herramienta se carga (import dinámico) la primera vez que se abre.
import { $, loadState, saveState } from './ui.js';
import { TOOLS, CATEGORIES, toolById, searchTools } from './tools/registry.js';

// scripts/build.mjs sustituye el marcador por «versión · hash» al publicar.
export const APP_VERSION = '__APP_VERSION__';
document.getElementById('version').textContent = APP_VERSION.startsWith('__') ? 'dev' : APP_VERSION;

// ---------------------------------------------------------------------------
// Inicio: buscador, recientes y categorías
// ---------------------------------------------------------------------------

const MAX_RECENT = 3;

function toolLink(t, compact = false) {
  const a = document.createElement('a');
  a.className = compact ? 'chip' : 'tool';
  a.href = `#/${t.id}`;
  const strong = document.createElement('strong');
  strong.textContent = t.title;
  a.append(strong);
  if (!compact) {
    const span = document.createElement('span');
    span.textContent = t.desc;
    a.append(span);
  }
  return a;
}

function renderHome() {
  const query = $('search').value.trim();
  const found = searchTools(query);

  const recent = $('recent');
  const recentTools = (loadState('recent') || []).map(toolById).filter(Boolean);
  recent.replaceChildren();
  recent.hidden = !!query || recentTools.length === 0;
  if (!recent.hidden) {
    const h = document.createElement('h2');
    h.textContent = 'Recientes';
    recent.append(h, ...recentTools.map((t) => toolLink(t, true)));
  }

  const catalog = $('catalog');
  catalog.replaceChildren();
  for (const cat of CATEGORIES) {
    const tools = found.filter((t) => t.category === cat);
    if (!tools.length) continue;
    const h = document.createElement('h2');
    h.textContent = cat;
    const nav = document.createElement('nav');
    nav.className = 'tools';
    nav.setAttribute('aria-label', cat);
    nav.append(...tools.map((t) => toolLink(t)));
    catalog.append(h, nav);
  }
  const none = $('no-results');
  none.hidden = found.length > 0;
  none.textContent = `Ninguna herramienta coincide con «${query}».`;
}

function rememberRecent(id) {
  const list = [id, ...(loadState('recent') || []).filter((x) => x !== id)].slice(0, MAX_RECENT);
  saveState('recent', list);
}

$('search').addEventListener('input', renderHome);
$('search').addEventListener('keydown', (e) => {
  // Enter abre la primera coincidencia.
  if (e.key !== 'Enter') return;
  const first = searchTools($('search').value)[0];
  if (first) location.hash = `#/${first.id}`;
});

// ---------------------------------------------------------------------------
// Router por hash
// ---------------------------------------------------------------------------

const mounted = new Map(); // id -> Promise<HTMLElement>
let current = null;
let cameFromHome = false;

function mountTool(tool) {
  if (!mounted.has(tool.id)) {
    const section = document.createElement('section');
    section.dataset.view = tool.id;
    section.hidden = true;
    $('app').append(section);
    mounted.set(tool.id, tool.load()
      .then((mod) => { mod.mount(section); return section; })
      .catch((e) => {
        console.error(e);
        mounted.delete(tool.id);
        section.innerHTML = '<p class="error">No se pudo cargar la herramienta. Comprueba la conexión y vuelve a intentarlo.</p>';
        return section;
      }));
  }
  return mounted.get(tool.id);
}

function showView(id) {
  for (const el of document.querySelectorAll('[data-view]')) el.hidden = el.dataset.view !== id;
}

async function route() {
  const id = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
  const tool = toolById(id);
  const prev = current;
  current = tool ? tool.id : 'home';
  window.scrollTo(0, 0);

  $('back').hidden = !tool;
  $('brand').hidden = !!tool;
  $('title').hidden = !tool;

  if (!tool) {
    document.title = 'I&C Toolbox';
    renderHome();
    showView('home');
    return;
  }
  cameFromHome = prev === 'home';
  document.title = `${tool.title} · I&C Toolbox`;
  $('title').textContent = tool.title;
  rememberRecent(tool.id);
  await mountTool(tool);
  if (current === tool.id) showView(tool.id);
}

// «Atrás» vuelve al inicio sin apilar historial: si se llegó desde el inicio, deshace
// esa navegación (así el botón atrás de Android no rebota entre inicio y herramienta).
$('back').addEventListener('click', (e) => {
  e.preventDefault();
  if (cameFromHome) history.back();
  else location.replace('#/');
});

window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------------------
// Tema: automático (el del sistema), claro u oscuro
// ---------------------------------------------------------------------------

const themeSel = $('theme');
themeSel.value = document.documentElement.dataset.theme || 'auto';
themeSel.addEventListener('change', () => {
  const t = themeSel.value;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === 'auto') localStorage.removeItem('ict.theme');
    else localStorage.setItem('ict.theme', t);
  } catch { /* sin almacenamiento: el tema dura hasta cerrar */ }
});

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
