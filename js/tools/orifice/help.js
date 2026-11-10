/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Placa orificio con las ecuaciones de ISO 5167-2: calcula el caudal a partir del ΔP, dimensiona el diámetro del orificio d para un caudal máximo o calcula el caudal a partir del rango de diseño de la hoja de datos de la placa.',
  inputs: [
    ['Diámetro interno de la tubería D', 'Por NPS y schedule (ASME B36.10M) o manual en mm o pulgadas. Usa el diámetro interno real si lo mides.'],
    ['d del orificio', 'Diámetro del orificio de la placa (de la hoja de datos). β = d / D debe estar entre 0,10 y 0,75.'],
    ['Tomas de presión', 'Esquina, brida o D y D/2: deben coincidir con las de la instalación.'],
    ['ΔP', 'Directo o desde una señal mA (con su URV y si el transmisor extrae raíz cuadrada).'],
    ['Fluido', 'Líquido, mezcla crudo-agua (con BSW), gas o vapor, con su densidad a las condiciones de operación; para gas, p1, T1, M, κ y Z. «Elegir de la tabla» los rellena desde la tabla de Densidades.'],
    ['Viscosidad dinámica', 'Solo afecta al número de Reynolds y al coeficiente C.'],
    ['Coeficiente de descarga C', 'Calculado (Reader-Harris/Gallagher) o fijo, si tu hoja de datos da uno.'],
    ['Desde rango: Q máx y ΔP a Q máx', 'Los datos de diseño de la placa y la densidad de diseño frente a la real.'],
  ],
  example: {
    title: 'Caudal de agua por una placa en 100 mm',
    steps: [
      'Pestaña «Calcular caudal». D = 100 mm, d = 60 mm, tomas de brida.',
      'ΔP = 250 mbar. Fluido: líquido, ρ = 998,2 kg/m³, viscosidad 1 cP.',
      'Otro caso, pestaña «Desde rango»: Q máx 100 m³/h a 250 mbar, ρ de diseño igual a la real, ΔP actual 100 mbar.',
    ],
    result: 'β = 0,600, C ≈ 0,609, Re_D ≈ 166 000, Q ≈ 47,05 m³/h. Desde rango: Q = 100·√(100/250) = 63,2 m³/h.',
  },
  limits: [
    'Rango de ISO 5167-2: D de 50 a 1000 mm, d ≥ 12,5 mm, β de 0,10 a 0,75 y Reynolds mínimo según β y las tomas. La herramienta avisa al salirte.',
    'Gases: p2/p1 ≥ 0,75; por debajo la expansibilidad ε no es válida.',
    '«Desde rango» supone C y ε constantes y solo corrige por densidad: no sirve si el Reynolds cambia mucho o si p1 y T cambian en un gas.',
    'En emulsiones crudo-agua la viscosidad puede ser 10-100 veces la del crudo; si dudas, prueba un valor alto y mira si C cambia.',
    'Las incertidumbres de C y ε son las de la norma; no incluyen las de D, d, ΔP ni la densidad.',
    'Comprueba en el HART o el DCS si la raíz cuadrada la hace el transmisor o el sistema: el resultado cambia mucho.',
    'No sustituye un cálculo de transferencia de custodia.',
  ],
  standards: [
    'ISO 5167-1 e ISO 5167-2:2003: coeficiente de descarga de Reader-Harris/Gallagher, expansibilidad (ec. 5), pérdida de presión permanente (ec. 7).',
    'Diámetros de tubería: ASME B36.10M.',
    'Los tests comparan contra la librería de referencia «fluids» (Python).',
  ],
};
