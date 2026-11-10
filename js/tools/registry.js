// Catálogo de herramientas. Para añadir una:
//   1. cálculo en un módulo puro con tests (js/<algo>.js + tests/<algo>.test.js);
//   2. vista en js/tools/<id>/view.js que exporte mount(section);
//   3. instructivo en js/tools/<id>/help.js que exporte `help` (ver js/help.js);
//   4. una entrada aquí.
// El inicio, el buscador y la precarga offline salen de esta lista; no hay que tocar
// index.html ni sw.js.

/** Orden en que se muestran las categorías en el inicio. */
export const CATEGORIES = ['Conversiones', 'Señales', 'Sensores', 'Calibración', 'Caudal', 'Nivel', 'Control', 'Fluidos', 'Referencias'];

/**
 * @typedef {object} Tool
 * @property {string} id        ruta (#/id) y nombre de la carpeta
 * @property {string} title     título en la cabecera
 * @property {string} desc      una línea en el inicio
 * @property {string} category  una de CATEGORIES
 * @property {string} keywords  términos extra para el buscador
 * @property {() => Promise<{mount: (section: HTMLElement) => void}>} load
 * @property {() => Promise<{help: import('../help.js').Help}>} help  instructivo del botón «?» (obligatorio: lo exige tests/help.test.js)
 */

/** @type {Tool[]} */
export const TOOLS = [
  {
    id: 'units',
    title: 'Conversor de unidades',
    desc: 'Presión, temperatura, caudal, nivel',
    category: 'Conversiones',
    keywords: 'unidades bar psi kpa mbar inh2o mmh2o kgf atm torr °c °f kelvin rankine m3/h gpm bbl kg/h longitud mm pulgadas',
    load: () => import('./units/view.js'),
    help: () => import('./units/help.js'),
  },
  {
    id: 'signal',
    title: 'Escalado de señales',
    desc: '4-20 mA, 0-10 V, 3-15 psi… ↔ % ↔ cualquier unidad; raíz cuadrada, NAMUR',
    category: 'Señales',
    keywords: 'escalado escalar 4-20 0-10v 1-5v 3-15psi neumática tensión volt pf capacidad corriente ma porcentaje lrv urv rango calibración raíz cuadrada namur ne43 transmisor lazo',
    load: () => import('./signal/view.js'),
    help: () => import('./signal/help.js'),
  },
  {
    id: 'temperature',
    title: 'RTD y termopares',
    desc: 'Pt100/Pt1000, Ni120 y termopares J K T E N R S B: °C ↔ Ω / mV, junta fría',
    category: 'Sensores',
    keywords: 'temperatura rtd pt100 pt500 pt1000 ni100 ni1000 ni120 níquel platino iec 60751 callendar van dusen ohm resistencia termopar termocupla thermocouple tc mv milivoltios its-90 iec 60584 junta fría compensación cjc 2 hilos cables calibración',
    load: () => import('./temperature/view.js'),
    help: () => import('./temperature/help.js'),
  },
  {
    id: 'calibration',
    title: 'Estadística de calibración',
    desc: 'Media, desviación típica, incertidumbre y error % span; error total probable (RSS)',
    category: 'Calibración',
    keywords: 'estadística desviación estándar típica sigma media promedio repetibilidad incertidumbre tipo a gum student error span lectura tolerancia cumple patrón calibrador error total probable tpe rss hoja de datos exactitud estabilidad url turndown efecto temperatura presión estática',
    load: () => import('./calibration/view.js'),
    help: () => import('./calibration/help.js'),
  },
  {
    id: 'level',
    title: 'Nivel por ΔP',
    desc: 'LRV y URV con supresión o elevación de cero: pierna seca/húmeda, sellos remotos',
    category: 'Nivel',
    keywords: 'nivel transmisor presión diferencial dp delta p supresión elevación cero zero suppression elevation pierna húmeda seca wet dry leg capilar sello remoto diafragma relleno silicona tanque abierto cerrado lrv urv rango calibración densidad hidrostática altura montaje offset',
    load: () => import('./level/view.js'),
    help: () => import('./level/help.js'),
  },
  {
    id: 'pid',
    title: 'Sintonía PID',
    desc: 'Modelo desde un escalón, Lambda, SIMC, Ziegler-Nichols, Cohen-Coon; parámetros para Logix PID/PIDE, Micro850, M221, M340',
    category: 'Control',
    keywords: 'pid pi sintonía sintonizar tuning lazo control ganancia kc kp ki kd ti td reset rate integral derivativa proporcional banda escalón bump test curva de reacción tiempo muerto constante de tiempo fopdt integrador nivel lambda imc simc skogestad ziegler nichols cohen coon tyreus luyben ciclo sostenido ganancia última ku pu robustez ms allen bradley rockwell controllogix compactlogix logix pide micro850 micro800 ccw schneider modicon m221 m340 pidff control expert',
    load: () => import('./pid/view.js'),
    help: () => import('./pid/help.js'),
  },
  {
    id: 'densities',
    title: 'Densidades de fluidos',
    desc: 'Agua, glicoles, petróleo (°API), gases y vapor: densidad y viscosidad según la temperatura',
    category: 'Fluidos',
    keywords: 'densidad peso específico sg gravedad específica relativa api grados crudo petróleo gasolina diésel gasóleo jet queroseno fuel oil agua etanol metanol acetona benceno tolueno hexano glicol etilenglicol propilenglicol anticongelante mercurio propano butano glp amoníaco co2 aire nitrógeno oxígeno hidrógeno helio argón metano etano gas natural vapor saturado viscosidad cinemática dinámica cp cst masa molar compresibilidad z peng robinson dilatación temperatura tabla fluido',
    load: () => import('./densities/view.js'),
  },
  {
    id: 'orifice',
    title: 'Placa orificio',
    desc: 'ISO 5167-2: caudal, dimensionamiento de d y caudal desde rango',
    category: 'Caudal',
    keywords: 'iso 5167 delta p dp diferencial beta diámetro crudo bsw agua gas vapor reader-harris gallagher brida schedule nps',
    load: () => import('./orifice/view.js'),
    help: () => import('./orifice/help.js'),
  },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Herramientas cuyo texto contiene todas las palabras de la búsqueda (sin acentos ni mayúsculas). */
export function searchTools(query, tools = TOOLS) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return tools;
  return tools.filter((t) => {
    const text = norm(`${t.title} ${t.desc} ${t.category} ${t.keywords}`);
    return words.every((w) => text.includes(w));
  });
}
