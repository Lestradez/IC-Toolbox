/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Convierte el teléfono en un nivel de burbuja y un inclinómetro: muestra la inclinación en grados, en % y en mm/m, útil para pendientes de líneas de impulso, bandejas, soportes y plomadas.',
  inputs: [
    ['Posición del teléfono', '«Plano»: acostado sobre la superficie (mesa, tubería, soporte). «Vertical»: de pie, con la espalda contra una pared, poste o tubería vertical (plomada).'],
    ['Activar sensores', 'Hay que pulsarlo. En iPhone aparece un permiso la primera vez. Funciona solo en el teléfono y con la página en https.'],
    ['Congelar', 'Fija la lectura en pantalla para poder retirar el teléfono y leerla con calma.'],
    ['Poner a cero aquí', 'Toma la posición actual como 0°. Sirve para anular una funda o una superficie de referencia que no es perfecta. Se recuerda por posición.'],
  ],
  example: {
    title: 'Pendiente de una línea de impulso de 1:12',
    steps: [
      'Posición: Plano. Activa los sensores.',
      'Apoya el teléfono sobre una superficie que sepas nivelada, con la parte superior apuntando hacia donde irá la pendiente, y pulsa «Poner a cero aquí».',
      'Apóyalo sobre el tubo con el borde superior a lo largo de la línea.',
      'Una pendiente de 1:12 es una inclinación de 4,76°.',
    ],
    result: '1:12 = 4,76° = 8,3 % = 83 mm/m',
  },
  limits: [
    'Un acelerómetro de teléfono da típicamente ±0,5° (0,9 % o 9 mm/m). No sirve para alineaciones de precisión ni para validar un nivel de burbuja certificado.',
    'Mide la inclinación del teléfono, no de la superficie: una funda gruesa, polvo o un teléfono con la cámara abultada falsean la lectura. Para comprobar, apoya el teléfono, anota, gíralo 180° sobre el mismo punto y repite: el promedio de ambas es la inclinación real; la mitad de la diferencia es el error del sensor.',
    'Con vibración (cerca de bombas y motores) la lectura oscila: usa «Congelar» y repite.',
    'Si el teléfono está boca abajo, los signos se invierten (la app lo avisa).',
    'Los sensores exigen https y un navegador de teléfono. En un ordenador no hay lectura.',
  ],
  standards: [
    'Inclinación calculada a partir de la dirección de la gravedad que entrega la API estándar W3C DeviceOrientation (ángulos beta y gamma).',
    'Pendiente = tan(ángulo); 1:N equivale a un ángulo de atan(1/N).',
  ],
};
