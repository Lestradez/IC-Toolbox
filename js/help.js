// Ayuda en la app: botón «?» de cada herramienta y guía de inicio.
//
// Cada herramienta tiene un js/tools/<id>/help.js que exporta `help` (ver REQUIRED abajo)
// y el registro lo enlaza en `help:`. tests/help.test.js falla si falta alguna, para que
// ninguna herramienta nueva se quede sin instructivo. Todo es texto plano: se pinta con
// textContent, así que no hay HTML que mantener ni escapar.

/**
 * @typedef {object} Help
 * @property {string} summary   qué calcula, en una o dos frases
 * @property {[string, string][]} inputs  [dato, qué significa y de dónde sacarlo]
 * @property {{title: string, steps: string[], result: string}} example  ejemplo resuelto
 * @property {string[]} limits  límites de validez (cuándo NO fiarse)
 * @property {string[]} standards  norma o fuente de cada cálculo
 * @property {{level: 'ok'|'warn'|'bad', text: string}[]} [reliability]  avisos de fiabilidad
 */

/** Problemas de una ayuda (lista vacía = válida). Lo usa el test. */
export function helpProblems(help) {
  const out = [];
  const text = (v) => typeof v === 'string' && v.trim().length > 0;
  if (!help || typeof help !== 'object') return ['no hay ayuda'];
  if (!text(help.summary)) out.push('falta summary');
  if (!Array.isArray(help.inputs) || help.inputs.length === 0 ||
      !help.inputs.every((p) => Array.isArray(p) && p.length === 2 && p.every(text))) out.push('inputs debe ser una lista de [dato, descripción]');
  const ex = help.example;
  if (!ex || !text(ex.title) || !text(ex.result) || !Array.isArray(ex.steps) || ex.steps.length === 0 || !ex.steps.every(text)) {
    out.push('falta el ejemplo resuelto (title, steps, result)');
  }
  for (const k of ['limits', 'standards']) {
    if (!Array.isArray(help[k]) || help[k].length === 0 || !help[k].every(text)) out.push(`${k} debe ser una lista de textos`);
  }
  for (const r of help.reliability ?? []) {
    if (!['ok', 'warn', 'bad'].includes(r.level) || !text(r.text)) out.push('reliability: {level: ok|warn|bad, text}');
  }
  return out;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function section(title, ...children) {
  const s = el('section', 'help-sec');
  s.append(el('h3', '', title), ...children);
  return s;
}

function list(items, tag = 'ul') {
  const l = el(tag);
  for (const t of items) l.append(el('li', '', t));
  return l;
}

/** Ayuda de una herramienta, lista para meter en el diálogo. */
export function renderHelp(help) {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'help-summary', help.summary));

  for (const r of help.reliability ?? []) frag.append(el('p', `help-flag ${r.level}`, r.text));

  const dl = el('dl');
  for (const [name, desc] of help.inputs) dl.append(el('dt', '', name), el('dd', '', desc));
  frag.append(section('Qué datos pide', dl));

  const ex = help.example;
  frag.append(section(`Ejemplo: ${ex.title}`, list(ex.steps, 'ol'), el('p', 'help-result', ex.result)));
  frag.append(section('Límites de validez', list(help.limits)));
  frag.append(section('Norma y fuentes', list(help.standards)));
  return frag;
}

/** Guía de inicio: { summary, sections: [{heading, items}] }. */
export function renderGuide(guide) {
  const frag = document.createDocumentFragment();
  frag.append(el('p', 'help-summary', guide.summary));
  for (const s of guide.sections) frag.append(section(s.heading, list(s.items)));
  return frag;
}
