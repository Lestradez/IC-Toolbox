// Tuberías de acero ASME B36.10M: diámetro exterior (mm) y espesor de pared (mm) por schedule.
// Datos puros, sin DOM. Los schedules van en arrays para conservar el orden
// (las claves numéricas de un objeto JS se reordenan).

/** @type {Record<string, {od: number, w: [string, number][]}>} */
export const PIPES = {
  '1/2"': { od: 21.34, w: [['40 / STD', 2.77], ['80 / XS', 3.73], ['160', 4.78], ['XXS', 7.47]] },
  '3/4"': { od: 26.67, w: [['40 / STD', 2.87], ['80 / XS', 3.91], ['160', 5.56], ['XXS', 7.82]] },
  '1"': { od: 33.40, w: [['40 / STD', 3.38], ['80 / XS', 4.55], ['160', 6.35], ['XXS', 9.09]] },
  '1-1/4"': { od: 42.16, w: [['40 / STD', 3.56], ['80 / XS', 4.85], ['160', 6.35], ['XXS', 9.70]] },
  '1-1/2"': { od: 48.26, w: [['40 / STD', 3.68], ['80 / XS', 5.08], ['160', 7.14], ['XXS', 10.15]] },
  '2"': { od: 60.33, w: [['40 / STD', 3.91], ['80 / XS', 5.54], ['160', 8.74], ['XXS', 11.07]] },
  '2-1/2"': { od: 73.03, w: [['40 / STD', 5.16], ['80 / XS', 7.01], ['160', 9.53], ['XXS', 14.02]] },
  '3"': { od: 88.90, w: [['40 / STD', 5.49], ['80 / XS', 7.62], ['160', 11.13], ['XXS', 15.24]] },
  '4"': { od: 114.30, w: [['40 / STD', 6.02], ['80 / XS', 8.56], ['120', 11.13], ['160', 13.49], ['XXS', 17.12]] },
  '6"': { od: 168.28, w: [['40 / STD', 7.11], ['80 / XS', 10.97], ['120', 14.27], ['160', 18.26], ['XXS', 21.95]] },
  '8"': { od: 219.08, w: [['20', 6.35], ['30', 7.04], ['40 / STD', 8.18], ['60', 10.31], ['80 / XS', 12.70], ['100', 15.09], ['120', 18.26], ['140', 20.62], ['160', 23.01], ['XXS', 22.23]] },
  '10"': { od: 273.05, w: [['20', 6.35], ['30', 7.80], ['40 / STD', 9.27], ['60 / XS', 12.70], ['80', 15.09], ['100', 18.26], ['120', 21.44], ['140 / XXS', 25.40], ['160', 28.58]] },
  '12"': { od: 323.85, w: [['20', 6.35], ['30', 8.38], ['STD', 9.53], ['40', 10.31], ['XS', 12.70], ['60', 14.27], ['80', 17.48], ['100', 21.44], ['120 / XXS', 25.40], ['140', 28.58], ['160', 33.32]] },
  '14"': { od: 355.60, w: [['STD', 9.53], ['40', 11.13], ['XS', 12.70], ['80', 19.05]] },
  '16"': { od: 406.40, w: [['STD', 9.53], ['40 / XS', 12.70], ['80', 21.44]] },
  '18"': { od: 457.20, w: [['STD', 9.53], ['XS', 12.70], ['40', 14.27], ['80', 23.83]] },
  '20"': { od: 508.00, w: [['STD', 9.53], ['XS', 12.70], ['40', 15.09], ['80', 26.19]] },
  '24"': { od: 609.60, w: [['STD', 9.53], ['XS', 12.70], ['40', 17.48], ['80', 30.96]] },
};

/** Schedules de un NPS, en orden, como Map(schedule -> espesor mm). */
export function schedules(nps) {
  const p = PIPES[nps];
  if (!p) throw new Error(`NPS desconocido: ${nps}`);
  return new Map(p.w);
}

/** Diámetro interno en mm. */
export function pipeID(nps, schedule) {
  const p = PIPES[nps];
  if (!p) throw new Error(`NPS desconocido: ${nps}`);
  const t = schedules(nps).get(schedule);
  if (t === undefined) throw new Error(`Schedule ${schedule} no disponible para ${nps}`);
  return { id: p.od - 2 * t, od: p.od, t };
}

/**
 * Elige el schedule equivalente al cambiar de NPS (p. ej. "40 / STD" → "40" o "STD").
 * Si no existe, devuelve el primero.
 */
export function matchSchedule(nps, prev) {
  const keys = [...schedules(nps).keys()];
  if (keys.includes(prev)) return prev;
  const parts = String(prev).split(' / ');
  // Prioridad al número de schedule frente a STD/XS (en 12" no coinciden: Sch 40 ≠ STD).
  for (const part of parts) {
    const k = keys.find((key) => key.split(' / ').includes(part));
    if (k) return k;
  }
  return keys[0];
}
