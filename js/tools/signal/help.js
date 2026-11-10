/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Escala una señal de instrumentación (4-20 mA, 0-10 V, 3-15 psi…) a porcentaje y a cualquier otra señal o unidad de ingeniería, con extracción de raíz cuadrada opcional.',
  inputs: [
    ['Señal estándar (entrada y salida)', 'Elige un preset (4-20 mA, 1-5 V, 3-15 psi…) o «Personalizada» para otro rango y unidad.'],
    ['Mínimo (0 %) y Máximo (100 %)', 'Los valores de la señal que corresponden al 0 % y al 100 % (LRV y URV).'],
    ['Entrada / Señal (%) / Salida', 'Escribe en cualquiera de los tres: los otros dos se recalculan.'],
    ['Extracción de raíz cuadrada', 'Actívala cuando la señal de entrada es un ΔP y la salida es caudal (el caudal es proporcional a √ΔP).'],
  ],
  example: {
    title: 'Un transmisor de ΔP 4-20 mA que mide 0-10 m³/h',
    steps: [
      'Entrada: 4-20 mA. Salida: personalizada, 0 a 10.',
      'Escribe 12 mA en la entrada.',
      'Sin raíz cuadrada: 12 mA es el 50 % y la salida es 5.',
      'Con raíz cuadrada: el 50 % de ΔP es el 70,7 % del caudal.',
    ],
    result: 'Lineal: 5. Con raíz cuadrada: 7,071.',
  },
  limits: [
    'Con raíz cuadrada, los valores cercanos a 0 % son muy sensibles al ruido; muchos equipos aplican un corte de bajo caudal que aquí no se modela.',
    'Comprueba en el HART o en el DCS quién hace la raíz (transmisor o sistema): aplicarla dos veces o ninguna da un resultado muy distinto.',
    'El aviso NAMUR (NE 43) solo se muestra en 4-20 mA: fallo bajo < 3,6 mA, saturación 3,8–20,5 mA, fallo alto > 21 mA.',
    'Los valores fuera de 0–100 % se calculan igual (extrapolados); no significa que el instrumento lo mida.',
  ],
  standards: [
    'Señales estándar según IEC 60381-1 (corriente y tensión) y las neumáticas habituales 3-15 psi / 0,2-1 bar.',
    'Umbrales de fallo y saturación según NAMUR NE 43.',
  ],
};
