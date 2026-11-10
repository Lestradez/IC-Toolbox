/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Dos cálculos para instrumentos de presión y similares: (1) estadística de un punto de calibración (media, error, desviación e incertidumbre, con veredicto cumple / no cumple) y (2) error total probable del transmisor a partir de su hoja de datos.',
  inputs: [
    ['LRV y URV', 'El rango calibrado; el span es URV − LRV y es la base del «% span».'],
    ['Valor del patrón', 'Lo que genera o mide el patrón en ese punto, en las mismas unidades del rango.'],
    ['Lecturas del instrumento', 'Varias lecturas repetidas en ese punto, separadas por espacio, punto y coma o salto de línea (la coma es el decimal). Cuantas más, mejor se estima la repetibilidad.'],
    ['Incertidumbre del patrón U (k = 2)', 'La del certificado de calibración de tu patrón. Opcional: sin ella no se incluye.'],
    ['Tolerancia (± % span)', 'El error máximo admitido por tu procedimiento en ese punto.'],
    ['Hoja de datos (error total)', 'URL, exactitud de referencia, efectos de temperatura y de presión estática, estabilidad y otros, cada uno con la base en que lo da el fabricante (% span, % URL, % lectura o unidades).'],
  ],
  example: {
    title: 'Un punto de calibración y el error total de un transmisor',
    steps: [
      'Lecturas: rango 0–10 bar, patrón 5 bar, lecturas 5,02 5,03 5,01 5,02 5,03; U del patrón 0,005 bar; tolerancia 0,5 % span.',
      'Error total (hoja): rango 0–10 bar, URL 25 bar, lectura de trabajo 10 bar; exactitud 0,065 % span; temperatura 0,0125 % URL + 0,0625 % span por 28 °C (real 28 °C); estabilidad 0,1 % URL en 5 años (calibras cada año).',
    ],
    result: 'Lecturas: media 5,022 bar, error +0,022 bar (+0,22 % span), U = 0,0106 bar (k = 2,37): |error| + U = 0,033 bar < 0,05 bar, cumple. Hoja: ±0,125 % span (RSS), peor caso ±0,209 % span, turndown 2,5:1.',
  },
  limits: [
    'La estadística supone lecturas independientes del mismo punto; con pocas lecturas el factor k de Student sube (k = 2,37 con 5 lecturas).',
    'El veredicto sigue la regla de ILAC-G8: entre «cumple» y «no cumple» hay una zona de duda cuando el error está dentro de la incertidumbre.',
    'La incertidumbre aquí solo incluye repetibilidad y el patrón. No incluye resolución del indicador, histéresis ni efectos ambientales: añádelos si tu procedimiento lo pide.',
    'RSS supone efectos independientes. Para un margen garantizado usa el peor caso (suma lineal).',
    'Con turndown alto (URL / span) los efectos en % del URL pesan mucho; revisa en la hoja si la exactitud de referencia empeora a partir de cierto turndown.',
    'Resultados distintos entre fabricantes: lee cada efecto tal como lo define su hoja (por ejemplo, «por 28 °C» o «por 69 bar»).',
  ],
  standards: [
    'Incertidumbre: GUM (JCGM 100), factor k de Student con grados de libertad efectivos (Welch-Satterthwaite, anexo G), confianza 95,45 %.',
    'Veredicto con incertidumbre: ILAC-G8.',
    'Error total probable: combinación RSS habitual en hojas de datos de transmisores de presión.',
  ],
};
