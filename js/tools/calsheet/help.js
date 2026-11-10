/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Planilla de calibración de un instrumento: datos del instrumento y del patrón, puntos de subida y bajada como se encontró (as found) y como se dejó (as left), error en % del span, histéresis y cumple / no cumple. Se guarda en el teléfono sin conexión y se exporta a Excel o a PDF.',
  inputs: [
    ['TAG y datos del instrumento', 'Lo que identifica al instrumento en la planta. Solo sirven para el informe.'],
    ['Tipo', 'Transmisor: se lee su salida (p. ej. mA) y se compara con la que corresponde al valor del patrón. Indicador: se lee el propio instrumento, en la misma unidad que el patrón.'],
    ['Rango y unidad', 'LRV y URV calibrados, en la unidad del patrón. En un transmisor, además la salida (4–20 mA, 0–10 V, 3–15 psi… u otra).'],
    ['Tolerancia (± % span)', 'Error máximo admitido por tu procedimiento o por la hoja de datos. La histéresis máxima es opcional: si la dejas vacía no se evalúa aparte.'],
    ['Puntos por serie', 'De 2 a 11, repartidos por igual: 3 = 0, 50, 100 %; 5 = 0, 25, 50, 75, 100 %.'],
    ['Datos del patrón', 'Descripción, marca y modelo, número de serie, número de certificado y vencimiento, tal como figuran en su certificado de calibración.'],
    ['Incertidumbre U del patrón (k = 2)', 'Opcional. Sale del certificado de calibración del patrón («incertidumbre expandida», k = 2), en la unidad del rango. En un transmisor puedes añadir la U del instrumento que mide la salida (multímetro o calibrador), en la unidad de salida.'],
    ['Lecturas', 'En cada punto: subida y bajada. «Patrón» vacío = valor nominal del punto; escribe el valor real si no pudiste aplicar justo el nominal (p. ej. con una balanza de pesos muertos).'],
  ],
  example: {
    title: 'Transmisor de presión 0–10 bar, 4–20 mA, 5 puntos',
    steps: [
      'Tolerancia ±0,5 % span; patrón con U = 0,005 bar (k = 2).',
      'As found en 50 % (5 bar, se esperan 12 mA): subida 12,10 mA y bajada 12,13 mA.',
      'Tras ajustar, as left en 50 %: subida 12,00 mA y bajada 12,02 mA.',
    ],
    result: 'U del patrón en la salida: 0,005 bar × 16 mA / 10 bar = 0,008 mA (0,05 % span), TUR 10:1. As found en 50 %: error ↑ +0,625 % y ↓ +0,813 % span, histéresis 0,188 %: no cumple (|error| − U supera 0,5 %). As left: error ↓ +0,125 % span, cumple.',
  },
  limits: [
    'Salida lineal. Para un transmisor con raíz cuadrada calcula la salida esperada con «Escalado de señales» y compárala a mano.',
    'Una lectura por punto y sentido. Para varias lecturas repetidas en un punto usa «Estadística de calibración».',
    'La incertidumbre solo incluye la del patrón (y la de la medición de salida si la cargas). No incluye resolución del indicador ni efectos ambientales.',
    'Las planillas se guardan en este navegador: si borras sus datos o desinstalas la app, se pierden. Exporta a Excel o PDF las que tengas que conservar.',
    'Es una planilla genérica: si tu empresa tiene un formato o un procedimiento propio, manda ese.',
  ],
  standards: [
    'Error en % del span e histéresis: ISA-51.1 (terminología de instrumentos de proceso).',
    'Regla de decisión con incertidumbre: ILAC-G8; sin incertidumbre declarada, aceptación simple (|error| ≤ tolerancia).',
    'Relación tolerancia / incertidumbre (TUR) recomendada ≥ 4:1 (ANSI/NCSL Z540.3 y práctica habitual).',
  ],
};
