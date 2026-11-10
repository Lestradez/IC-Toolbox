/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Densidad (y viscosidad cuando hay dato fiable) de fluidos comunes de proceso según la temperatura: agua, disolventes, gases licuados, mezclas agua-glicol, petróleo y derivados por °API, mercurio, gases y vapor saturado. En Nivel por ΔP y Placa orificio, el botón «Elegir de la tabla» rellena la densidad desde aquí.',
  inputs: [
    ['Líquido: fluido y temperatura', 'Elige el fluido y la temperatura de operación. Da densidad, SG, lb/ft³ y viscosidad dinámica y cinemática.'],
    ['Densidad conocida (petróleo y derivados)', 'La que da el laboratorio o la hoja del producto, a 15 °C en kg/m³ o en °API. Se corrige a la temperatura de operación.'],
    ['Gas: gas, temperatura, presión y referencia', 'Presión manométrica o absoluta (a la manométrica se le suma 1,01325 bar). Da densidad, masa molar, κ y Z.'],
    ['Vapor saturado: presión', 'Presión manométrica o absoluta; da la densidad del vapor saturado a esa presión.'],
  ],
  example: {
    title: 'Agua a 20 °C y un crudo de 35 °API a 40 °C',
    steps: [
      'Líquido: agua, 20 °C.',
      'Líquido: petróleo crudo, densidad conocida 35 °API, temperatura 40 °C.',
    ],
    result: 'Agua a 20 °C: 998,21 kg/m³ y 1,002 cP. Crudo de 35 °API (849,4 kg/m³ a 15 °C) a 40 °C: ≈ 831,2 kg/m³.',
  },
  limits: [
    'Los líquidos no se extrapolan: fuera del rango de temperatura de la tabla se avisa del rango en lugar de dar un número.',
    'Los gases licuados (propano, butanos, amoníaco, CO₂) están saturados, en equilibrio con su vapor; los orgánicos están a 1 atm.',
    'Gases: error de densidad ≈ 1 % hasta 10 bar y ≈ 3 % a 40 bar, y más cerca de la saturación (se avisa). Es gas puro: para gas natural con cromatografía usa AGA8-DC92.',
    'Vapor: solo saturado. Para vapor sobrecalentado usa las tablas de vapor.',
    'Un crudo real cambia con su composición y con el agua que arrastra (BSW).',
    'No incluye fluidos de relleno de capilar (silicona, Syltherm…): su densidad depende del fabricante; léela en la hoja del transmisor.',
    'La SG usa agua = 1000 kg/m³; los °API usan la SG a 60/60 °F con agua a 999,016 kg/m³.',
  ],
  standards: [
    'Agua, orgánicos, gases licuados y vapor: ecuaciones de estado de referencia (IAPWS-95 para el agua) vía CoolProp, tabuladas cada 5 °C e interpoladas.',
    'Mezclas agua-glicol: modelo de Melinder (IIR, 2010). Otros fabricantes de anticongelante dan tablas algo distintas.',
    'Petróleo: corrección de volumen de API MPMS 11.1 (ASTM D1250).',
    'Gases: ecuación de Peng-Robinson con constantes críticas de CoolProp.',
  ],
  reliability: [
    { level: 'ok', text: 'Agua, orgánicos, gases licuados y vapor salen de ecuaciones de referencia.' },
    { level: 'warn', text: 'Petróleo: aproximación de API 11.1 con base en 15 °C, comprobada contra una implementación pública y no contra la norma (de pago). No sirve para transferencia de custodia.' },
    { level: 'bad', text: 'Mercurio: constantes de memoria (13 595,08 kg/m³ a 0 °C), sin verificar en una fuente primaria.' },
  ],
};
