/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Convierte un valor entre unidades de presión, caudal volumétrico, caudal másico, temperatura y longitud, y lo muestra en todas las unidades a la vez.',
  inputs: [
    ['Magnitud', 'Qué vas a convertir: presión, caudal volumétrico, caudal másico, temperatura o longitud.'],
    ['Valor', 'El número a convertir. Acepta coma o punto decimal.'],
    ['Unidad', 'La unidad en que está ese valor. La tabla de abajo muestra el resultado en todas las demás; toca una fila para copiar el valor.'],
  ],
  example: {
    title: '100 inH₂O de un transmisor, a mbar',
    steps: ['Magnitud: Presión.', 'Valor: 100. Unidad: inH₂O (4 °C).', 'Mira la fila de mbar.'],
    result: '100 inH₂O = 249,089 mbar (≈ 24,91 kPa).',
  },
  limits: [
    'Presión: no distingue manométrica de absoluta; la conversión es solo de unidad. Suma 1,01325 bar tú mismo si necesitas pasar de una a otra.',
    'Las columnas de agua usan agua a 4 °C y g = 9,80665 m/s². Si tu transmisor está calibrado en inH₂O a 60 °F o 68 °F, la diferencia es de ~0,1–0,2 %.',
    'Temperatura: convierte valores absolutos. Para diferencias (ΔT), 1 °C = 1 K = 1,8 °F, sin sumar el desfase.',
    'Caudal en barriles: bbl/d es el barril de petróleo (158,987 L), no el de otras industrias.',
    'Los caudales de gas dependen de las condiciones de referencia (Nm³, Sm³): esta herramienta no las convierte, solo cambia de unidad.',
  ],
  standards: [
    'Factores de conversión exactos del SI y de la definición internacional de pulgada, libra y galón; g = 9,80665 m/s² (CGPM 1901).',
  ],
};
