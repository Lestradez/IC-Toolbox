// Piezas de interfaz compartidas por las herramientas: tarjeta de resultado con barra fija,
// botón ± para números negativos, copiar al portapapeles y avisos con «Deshacer».
import { $ } from './ui.js';

const LEVELS = { ok: 0, warn: 1, bad: 2 };

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

/**
 * HTML de una tarjeta de resultado. Los ids salen de `id`: <id>-main, <id>-alt,
 * <id>-rows, <id>-msgs, <id>-copy. `extra` va al final (botones propios de la herramienta).
 */
export function resultCardHTML(id, extra = '') {
  return `
  <div class="card result" id="${id}-card">
    <h2>Resultado</h2>
    <p class="big" aria-live="polite"><span id="${id}-main" class="main">—</span><span id="${id}-alt" class="alt"></span></p>
    <table class="results kv"><tbody id="${id}-rows"></tbody></table>
    <ul id="${id}-msgs" class="msgs"></ul>
    <div class="actions">
      <button type="button" id="${id}-copy">Copiar resultado</button>
    </div>
    ${extra}
  </div>`;
}

/**
 * Conecta una tarjeta de resultado: botón copiar y barra fija abajo que muestra el valor
 * principal mientras la tarjeta no está a la vista. Devuelve show(result).
 *
 * result = { value, unit, alt, rows: [[clave, valor]], msgs: [[nivel, texto]], text }
 * `text` es lo que se copia; si falta, no se puede copiar.
 */
export function bindResultCard(section, id) {
  const card = $(`${id}-card`);
  let copyText = '';

  const bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'result-bar';
  bar.hidden = true;
  bar.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="v"></span><span class="go">Ver detalle ↓</span>';
  bar.setAttribute('aria-label', 'Ir al resultado');
  section.append(bar);
  card.tabIndex = -1; // para poder darle el foco al saltar
  bar.addEventListener('click', () => {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    // Algunos visores (WebView, iframes) ignoran el desplazamiento suave: si a los
    // 600 ms la tarjeta sigue sin verse, salta sin animación y le da el foco.
    setTimeout(() => {
      const top = card.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.6) card.scrollIntoView({ block: 'start' });
      card.focus({ preventScroll: true });
    }, 600);
  });

  let cardVisible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      cardVisible = e.isIntersecting;
      bar.hidden = cardVisible || section.hidden;
    }).observe(card);
  }

  $(`${id}-copy`).addEventListener('click', async (e) => {
    if (!copyText) return;
    flash(e.currentTarget, (await copyToClipboard(copyText)) ? 'Copiado ✓' : 'No se pudo copiar');
  });

  return function show({ value = '—', unit = '', alt = '', rows = [], msgs = [], text = '' }) {
    copyText = text;
    const main = $(`${id}-main`);
    main.textContent = value;
    if (unit) {
      const u = document.createElement('small');
      u.textContent = ` ${unit}`;
      main.append(u);
    }
    $(`${id}-alt`).textContent = alt;

    const body = $(`${id}-rows`);
    body.replaceChildren();
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.textContent = k;
      const td = document.createElement('td');
      td.className = 'num';
      // «a · b · c» se pinta una por línea: no se parte un número a la mitad.
      for (const part of String(v).split(' · ')) {
        const s = document.createElement('span');
        s.textContent = part;
        td.append(s);
      }
      tr.append(th, td);
      body.append(tr);
    }

    const ul = $(`${id}-msgs`);
    ul.replaceChildren();
    let worst = 'ok';
    for (const [level, t] of msgs) {
      const li = document.createElement('li');
      li.className = level;
      li.textContent = t;
      ul.append(li);
      if (LEVELS[level] > LEVELS[worst]) worst = level;
    }

    bar.dataset.level = worst;
    bar.querySelector('.v').textContent = unit ? `${value} ${unit}` : value;
    bar.querySelector('.dot').title = { ok: 'Sin avisos', warn: 'Con avisos', bad: 'Con errores' }[worst];
    bar.hidden = cardVisible || section.hidden;
  };
}

// ---------------------------------------------------------------------------
// Números negativos
// ---------------------------------------------------------------------------

/**
 * Añade un botón ± a los <input data-signed>. Muchos teclados numéricos de Android
 * (inputmode="decimal") no tienen la tecla menos.
 */
export function enhanceSigned(root) {
  for (const input of root.querySelectorAll('input[data-signed]')) {
    const wrap = document.createElement('span');
    wrap.className = 'signed';
    input.replaceWith(wrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sign';
    btn.textContent = '±';
    btn.setAttribute('aria-label', 'Cambiar signo');
    btn.addEventListener('click', () => {
      const v = input.value.trim();
      input.value = v.startsWith('-') || v.startsWith('−') ? v.slice(1) : `-${v}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrap.append(btn, input);
  }
}

// ---------------------------------------------------------------------------
// Portapapeles y avisos
// ---------------------------------------------------------------------------

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Sin permiso o sin API (WebView antiguo): método clásico con un textarea temporal.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nada más que probar */ }
    ta.remove();
    return ok;
  }
}

/** Cambia el texto de un botón un momento («Copiado ✓»). */
export function flash(btn, text, ms = 1500) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = text;
  clearTimeout(btn._flash);
  btn._flash = setTimeout(() => { btn.textContent = btn.dataset.label; }, ms);
}

let toastTimer;
/**
 * Aviso breve abajo. Con `action`, muestra un botón (p. ej. «Deshacer») que llama a onAction.
 */
export function toast(text, { action, onAction, ms = 6000 } = {}) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span></span><button type="button"></button>';
    document.body.append(el);
  }
  el.querySelector('span').textContent = text;
  const btn = el.querySelector('button');
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = () => {
    el.hidden = true;
    onAction?.();
  };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
