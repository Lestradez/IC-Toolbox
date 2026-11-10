// Dibujo esquemático del tanque con sus cotas. Función pura: recibe números y etiquetas ya
// formateadas y devuelve el marcado SVG (sin datos del usuario sin escapar).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (v) => Number(v.toFixed(1));

/**
 * @param {object} o
 * @param {number} o.top       cota superior (> 0)
 * @param {number} o.tap       cota de la toma HP
 * @param {number} o.xmtr      cota del transmisor
 * @param {number} [o.lpTap]   cota de la toma LP (tanque cerrado)
 * @param {boolean} [o.cone]   fondo cónico bajo la referencia 0
 * @param {'dry'|'wet'|'capillary'|'none'} [o.lpKind]  qué lleva la línea LP
 * @param {{top:string, tap:string, xmtr:string, lp?:string, bottom:string}} o.labels  textos ya formateados
 */
export function tankDiagram({ top, tap, xmtr, lpTap, cone = false, lpKind = 'none', labels }) {
  const X0 = 112; const X1 = 232; // paredes
  const YT = 22; const YB = 232; // cota superior y referencia 0
  const clampY = (y) => Math.min(Math.max(y, 10), 296);
  const y = (z) => clampY(YB - (z / top) * (YB - YT));
  const yTap = y(tap);
  const yX = y(xmtr);
  const closed = Number.isFinite(lpTap);
  const yLp = closed ? y(lpTap) : 0;

  const body = cone
    ? `M${X0},${YT} V${YB} L${(X0 + X1) / 2 - 12},${YB + 40} H${(X0 + X1) / 2 + 12} L${X1},${YB} V${YT}`
    : `M${X0},${YT} V${YB} H${X1} V${YT}`;
  const roof = closed ? `<path class="roof" d="M${X0},${YT} H${X1}"/>` : '';

  const parts = [];
  parts.push(`<rect class="dead" x="${X0}" y="${n(yTap)}" width="${X1 - X0}" height="${n(Math.max(YB - yTap, 0))}"/>`);
  parts.push(`<rect class="meas" x="${X0}" y="${YT}" width="${X1 - X0}" height="${n(Math.max(yTap - YT, 0))}"/>`);
  parts.push(`<path class="wall" d="${body}"/>`, roof);
  // Líneas de cota a la derecha
  for (const [yy, text] of [[YT, labels.top], [yTap, labels.tap], [YB, labels.bottom]]) {
    parts.push(`<path class="tick" d="M${X1},${n(yy)} H${X1 + 8}"/>`);
    parts.push(`<text x="${X1 + 12}" y="${n(yy + 3)}">${esc(text)}</text>`);
  }
  if (yTap - YT > 40) parts.push(`<text class="zone" x="${(X0 + X1) / 2}" y="${n((YT + yTap) / 2 + 3)}" text-anchor="middle">medido</text>`);
  if (YB - yTap > 22) parts.push(`<text class="zone" x="${(X0 + X1) / 2}" y="${n((yTap + YB) / 2 + 3)}" text-anchor="middle">zona muerta</text>`);
  // Transmisor y líneas de impulso por la izquierda
  const bx = 14; const bw = 40;
  const hpY = yX - 5;
  parts.push(`<path class="line hp" d="M${X0},${n(yTap)} H84 V${n(hpY)} H${bx + bw}"/>`);
  if (closed) {
    parts.push(`<path class="line lp ${lpKind}" d="M${X0},${n(yLp)} H70 V${n(yX + 5)} H${bx + bw}"/>`);
    parts.push(`<text x="${X0 - 4}" y="${n(yLp < 20 ? yLp + 12 : yLp - 4)}" text-anchor="end">LP ${esc(labels.lp ?? '')}</text>`);
  }
  parts.push(`<rect class="xmtr" x="${bx}" y="${n(yX - 11)}" width="${bw}" height="22" rx="3"/>`);
  parts.push(`<text class="xt" x="${bx + bw / 2}" y="${n(yX + 3)}" text-anchor="middle">TX</text>`);
  parts.push(`<text x="${X0 - 4}" y="${n(yTap - 4)}" text-anchor="end">HP</text>`);
  parts.push(`<text x="${bx}" y="${n(Math.min(yX + 24, 306))}">${esc(labels.xmtr)}</text>`);

  return `<svg viewBox="0 0 360 310" role="img" aria-label="Esquema del tanque con las cotas de la toma, el transmisor y los extremos del rango">${parts.join('')}</svg>`;
}
