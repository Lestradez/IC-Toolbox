/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Calcula el LRV y el URV de un transmisor de presión diferencial que mide nivel, con supresión o elevación de cero, para tanque abierto o cerrado, pierna seca o húmeda y sellos remotos.',
  inputs: [
    ['Instalación', 'Tanque abierto, abierto con sello, cerrado con pierna seca, cerrado con pierna húmeda o cerrado con dos sellos remotos. Cambia los datos que se piden.'],
    ['Nivel al 0 % y al 100 %', 'Alturas, en la unidad elegida, entre las que quieres calibrar.'],
    ['Cota de la toma HP', 'Altura de la toma inferior (la que va al lado HP del transmisor) medida desde el mismo origen que los niveles.'],
    ['Densidad del líquido', 'Del producto en el tanque a su temperatura de operación; admite kg/m³, g/cm³, SG y lb/ft³.'],
    ['Transmisor por debajo (+) o por encima (−) de la toma HP', 'Distancia vertical entre la toma HP y el transmisor. Positiva si el transmisor queda por debajo.'],
    ['Distancia entre tomas', 'Tanque cerrado: de la toma HP a la LP.'],
    ['Densidad del relleno / de la pierna húmeda', 'Del aceite del capilar (sellos) o del líquido de referencia de la pierna LP.'],
    ['Límites del sensor (opcionales)', 'LRL y URL del transmisor: avisan si el rango calculado no cabe y dan el turndown.'],
  ],
  example: {
    title: 'Tanque cerrado con pierna húmeda',
    steps: [
      'Instalación: tanque cerrado, pierna húmeda. Unidad: mm.',
      'Nivel 0 % = 0 y 100 % = 1500. Toma HP en 0. Densidad 0,9 SG.',
      'Transmisor a la misma altura que la toma HP (desfase 0). Distancia entre tomas 1700 mm. Pierna húmeda con agua, SG 1.',
      'Unidad de presión: mbar.',
    ],
    result: 'LRV = −166,713 mbar, URV = −34,3233 mbar, span = 132,39 mbar (cero elevado). Con el mismo tanque abierto: LRV 0 y URV 132,39 mbar.',
  },
  limits: [
    'Con dos sellos remotos se supone el mismo relleno y la misma temperatura en los dos capilares; si no, aparece un error que no se modela (efecto de temperatura del capilar).',
    'La densidad se toma constante: si cambia mucho con la temperatura o la composición, el nivel medido tendrá error. El botón «Elegir de la tabla» junto a cada densidad la toma de la tabla de Densidades, con la temperatura.',
    'Supone nivel de líquido homogéneo, sin interfaces ni espuma.',
    'En pierna húmeda se supone que la pierna LP se mantiene llena (condensación o rellenado); si se vacía, el cero se desplaza.',
    'Los límites del sensor son opcionales y solo se usan para avisar.',
  ],
  standards: [
    'Presión hidrostática ΔP = ρ·g·h con g = 9,80665 m/s².',
    'Densidades del relleno: dependen del fabricante; toma el dato de la hoja del sello.',
  ],
};
