/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Calcula el rango de un transmisor de presión diferencial que mide nivel a partir de las cotas del tanque como se miden en planta: LRV y URV (en presión y en columna de líquido), el escalado del PLC en sus dos formas, la zona muerta bajo la toma y el esquema del tanque. Cubre tanque abierto o cerrado, pierna seca o húmeda y sellos remotos.',
  inputs: [
    ['Instalación', 'Tanque abierto, abierto con sello, cerrado con pierna seca, cerrado con pierna húmeda o cerrado con dos sellos remotos. Cambia los datos que se piden.'],
    ['Cota superior', 'Altura del aro del techo, medida desde la referencia 0 del tanque. Es el 100 % del lazo.'],
    ['Referencia 0', 'No se teclea: es el suelo del tanque o, en un decantador de fondo cónico, el aro donde termina el cono. Todas las cotas se miden desde ahí.'],
    ['Toma HP (o brida del sello)', 'Altura de la toma de proceso inferior, la que va al lado HP. Con sello remoto, la de la brida del sello. Es el 0 % del lazo: el transmisor no ve nada por debajo.'],
    ['Transmisor', 'Altura a la que está montado el instrumento. Vacío significa en la misma brida que la toma. Si queda por debajo de la toma, la línea de impulso llena suma presión en HP y suprime el cero. No se pide con dos sellos remotos porque se anula.'],
    ['Toma LP', 'Tanque cerrado: altura de la toma superior. Vacío significa la cota superior.'],
    ['Fondo cónico', 'Solo cambia el dibujo.'],
    ['Densidad del líquido', 'Del producto en el tanque a su temperatura de operación; admite kg/m³, g/cm³, SG y lb/ft³.'],
    ['Densidad del relleno / de la pierna húmeda', 'Del aceite del capilar (sellos) o del líquido de referencia de la pierna LP.'],
    ['Límites del sensor (opcionales)', 'LRL y URL del transmisor: avisan si el rango calculado no cabe y dan el turndown.'],
  ],
  example: {
    title: 'Tanque atmosférico de 9 m con la toma a 1 m',
    steps: [
      'Instalación: tanque abierto. Unidad: m. Unidad de presión: mbar.',
      'Cota superior 9. Toma HP 1. Transmisor vacío (montado en la misma brida).',
      'Densidad 0,9 SG.',
    ],
    result: 'LRV = 0 mbar y URV = 706,079 mbar (0 a 8 m de líquido). PLC: 1 a 9 m, o 0 a 8 m más 1 m de offset. Zona muerta: 0 a 1 m, el 11,1 % del tanque. Toma y transmisor al 11,1 % de la altura.',
  },
  limits: [
    'Con dos sellos remotos se supone el mismo relleno y la misma temperatura en los dos capilares; si no, aparece un error que no se modela (efecto de temperatura del capilar).',
    'La densidad se toma constante: si cambia mucho con la temperatura o la composición, el nivel medido tendrá error. El botón «Elegir de la tabla» junto a cada densidad la toma de la tabla de Densidades, con la temperatura.',
    'Supone nivel de líquido homogéneo, sin interfaces ni espuma.',
    'El transmisor no ve el líquido por debajo de la toma: la zona muerta no se mide. Si necesitas medirla, baja la toma o usa otro principio.',
    'En pierna húmeda se supone que la pierna LP se mantiene llena (condensación o rellenado); si se vacía, el cero se desplaza.',
    'Los límites del sensor son opcionales y solo se usan para avisar.',
  ],
  standards: [
    'Presión hidrostática ΔP = ρ·g·h con g = 9,80665 m/s².',
    'Densidades del relleno: dependen del fabricante; toma el dato de la hoja del sello.',
  ],
};
