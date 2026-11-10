// «Reportar un problema»: abre un issue de GitHub ya rellenado con la herramienta y la
// versión. El usuario lo revisa y lo envía él; no se manda nada automáticamente.

/**
 * @param {object} o
 * @param {string} o.repo      «dueño/repositorio»
 * @param {string} o.tool      id de la herramienta ('' = inicio)
 * @param {string} o.toolTitle título legible
 * @param {string} o.version
 * @param {string} [o.userAgent]
 * @param {boolean} [o.online]
 */
export function reportUrl({ repo, tool, toolTitle, version, userAgent = '', online = true }) {
  const where = toolTitle || 'Inicio';
  const body = [
    '**¿Qué pasó?**',
    '',
    '',
    '**¿Qué esperabas que pasara?**',
    '',
    '',
    '**Datos que ingresaste y resultado** (opcional)',
    '',
    '',
    '---',
    `Herramienta: ${where}${tool ? ` (#/${tool})` : ''}`,
    `Versión: ${version}`,
    `Conexión: ${online ? 'en línea' : 'sin conexión'}`,
    userAgent ? `Navegador: ${userAgent}` : '',
    '',
    '_Este reporte es público en GitHub: no pongas datos de tu planta que no quieras compartir._',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '' ).join('\n');
  const q = new URLSearchParams({ title: `[${where}] `, body });
  return `https://github.com/${repo}/issues/new?${q}`;
}

/** Enlace al formulario con herramienta, versión y navegador prellenados. '' si no hay formulario. */
export function formUrl({ url, fields, tool, toolTitle, version, userAgent = '' }) {
  if (!url) return '';
  const q = new URLSearchParams({ usp: 'pp_url' });
  if (fields.tool) q.set(fields.tool, toolTitle || 'Inicio');
  if (fields.version) q.set(fields.version, version);
  if (fields.browser && userAgent) q.set(fields.browser, userAgent);
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${q}`;
}
