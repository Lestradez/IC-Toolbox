/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Brújula con el sensor magnético del teléfono. Indica el rumbo respecto al norte magnético y, si escribes la declinación, también respecto al norte verdadero.',
  inputs: [
    ['Activar brújula', 'Hay que pulsarlo. En iPhone aparece un permiso la primera vez. Funciona solo en el teléfono y con la página en https.'],
    ['Declinación magnética (°)', 'Opcional. Diferencia entre el norte magnético y el verdadero en tu lugar: positiva si el norte magnético queda al este del verdadero, negativa si queda al oeste. Consúltala antes (p. ej. en la calculadora de campo magnético de NOAA/NCEI), porque la app no puede consultarla sin conexión. Cambia con los años.'],
    ['Rumbo', 'Grados desde el norte en sentido horario (0° = N, 90° = E, 180° = S, 270° = O). Con el teléfono acostado es el rumbo de su borde superior; de pie, el de la cámara trasera.'],
  ],
  example: {
    title: 'Orientar un plano al norte verdadero con declinación de −8°',
    steps: [
      'Aléjate de motores, tableros y estructuras de acero. Activa la brújula y escribe −8 en declinación.',
      'Apunta el borde superior del teléfono hacia el sentido deseado, con el teléfono horizontal.',
      'La aguja marca 90° magnéticos.',
      'Rumbo verdadero = 90° + (−8°).',
    ],
    result: '82° (E, norte verdadero); 90° magnético',
  },
  limits: [
    'Interferencia: motores, variadores, tableros, cables de potencia, tuberías, estructuras de acero y los imanes (fundas, soportes) desvían el norte decenas de grados. Si el rumbo cambia al caminar unos pasos, no es fiable.',
    'Muestra norte magnético, no geográfico, salvo que escribas la declinación. Un error en su signo da el doble de error.',
    'La precisión típica es de ±5° a ±15°, mucho peor que una brújula de campo; no la uses para replanteos de precisión.',
    'Hay que mantener el teléfono horizontal; si el sistema avisa que no está calibrado, dibuja un ocho en el aire con él.',
    'Si el teléfono solo entrega orientación relativa (algunos Android sin magnetómetro), la brújula no está disponible y la app lo dice. En ordenador tampoco funciona.',
  ],
  standards: [
    'Rumbo desde los ángulos absolutos de la API W3C DeviceOrientation (`deviceorientationabsolute`) en Android y desde `webkitCompassHeading` en iOS.',
    'Norte verdadero = norte magnético + declinación (este +, oeste −).',
  ],
};
