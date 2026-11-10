/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Convierte entre temperatura y la señal del sensor: resistencia para RTD (Pt100, Pt1000, Ni100, Ni1000, Ni120…) y milivoltios para termopares J, K, T, E, N, R, S y B, con compensación de junta fría y tabla de puntos de calibración.',
  inputs: [
    ['Pestaña RTD / Termopar', 'Tipo de sensor. Elige el tipo exacto: Pt100 y Pt1000 tienen la misma curva escalada, pero Ni100 y Ni120 son distintas.'],
    ['Temperatura y Ω (RTD) o mV (termopar)', 'Escribe una y se calcula la otra.'],
    ['Resistencia de los cables, ida + vuelta (Ω)', 'Solo RTD a 2 hilos: la resistencia total de los cables se suma al sensor. Con 3 o 4 hilos déjala en 0.'],
    ['Junta fría (°C)', 'Temperatura de los bornes donde se conecta el termopar. 25 °C es lo habitual en campo; pon 0 para trabajar con la tabla de referencia.'],
    ['LRV y URV (°C)', 'Rango del transmisor de temperatura. Genera la tabla de valores a inyectar con una década o un calibrador en 0, 25, 50, 75 y 100 %.'],
  ],
  example: {
    title: 'Pt100 y termopar K para calibrar un lazo',
    steps: [
      'RTD, tipo Pt100, temperatura 100 °C.',
      'Termopar tipo K, junta fría 0 °C, temperatura 400 °C.',
      'Termopar tipo K, junta fría 25 °C, el calibrador mide 10 mV: la herramienta suma el equivalente de 25 °C y da la temperatura real.',
    ],
    result: 'Pt100 a 100 °C = 138,505 Ω. K a 400 °C = 16,397 mV. K con 10 mV y junta a 25 °C = 270,7 °C.',
  },
  limits: [
    'Cada sensor solo es válido dentro del rango de su norma o tabla (p. ej. Pt100: −200 a 850 °C). Fuera de ahí la herramienta no extrapola y avisa.',
    'Los cálculos son de la curva nominal: no incluyen la tolerancia del sensor (clases A, B, 1/3 DIN…) ni su deriva.',
    'Los termopares se calculan sobre la tabla de referencia (junta a 0 °C); la compensación de junta fría es aritmética, como hace un transmisor ideal.',
    'Ni120 no tiene norma IEC: usa la tabla de Minco (α = 0,00672). Comprueba que tu transmisor use la misma curva.',
    'Con 2 hilos, 1 Ω de cable en un Pt100 son ≈ 2,6 °C de error; por eso hay que restar la resistencia de los cables.',
  ],
  standards: [
    'RTD de platino: IEC 60751 (Callendar-Van Dusen). Níquel: DIN 43760.',
    'Termopares: IEC 60584 con los coeficientes ITS-90 del NIST; la inversa se resuelve numéricamente.',
  ],
  reliability: [
    { level: 'warn', text: 'Ni120: la curva sale de una tabla del fabricante (Minco), no de una norma IEC.' },
  ],
};
