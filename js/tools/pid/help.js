/** @type {import('../../help.js').Help} */
export const help = {
  summary: 'Sintoniza lazos PI/PID a partir de una prueba de escalón en manual (o de un modelo que ya tengas, o de un ensayo de ciclo sostenido) y entrega los parámetros en la forma de tu PLC, con una simulación de la respuesta y una medida de robustez.',
  inputs: [
    ['Rangos del lazo', 'LRV y URV de la PV y mínimo y máximo de la CV: los mismos que tiene el bloque PID. Con ellos la ganancia se expresa en % del span.'],
    ['Tipo de proceso', 'Autorregulado (la PV se estabiliza sola tras un escalón) o integrador (la PV sigue subiendo o bajando, como un nivel).'],
    ['Prueba de escalón', 'CV antes y después, PV antes y final, y los tiempos t28 y t63 (o el inicio y t63), medidos desde el instante del escalón. Para integradores, las pendientes de PV antes y después.'],
    ['Modelo', 'Si ya conoces K, τ y θ del proceso, los escribes directamente.'],
    ['Ciclo sostenido', 'Ganancia última Ku y periodo último Pu, de subir solo la ganancia proporcional hasta que la PV oscile con amplitud constante.'],
    ['Regla y controlador', 'Lambda, SIMC, Ziegler-Nichols o Cohen-Coon (o Tyreus-Luyben con ciclo sostenido), y P, PI o PID.'],
    ['λ (constante de lazo cerrado)', 'Cuán rápido quieres el lazo: más pequeña = más rápido y menos robusto. El valor por defecto es una referencia prudente.'],
    ['Bloque de destino', 'PLC e instrucción: Logix PID/PIDE, Micro800, M221, M340 o genérico. Convierte Kc, Ti y Td a las unidades de ese bloque y muestra siempre P, I y D con el nombre del parámetro de tu PLC, listas para cargar o copiar (con punto decimal).'],
  ],
  example: {
    title: 'Sintonía SIMC de un lazo de temperatura',
    steps: [
      'Pestaña «Modelo», proceso autorregulado: K = 1,5 (% PV por % CV), τ = 45 s, θ = 10 s.',
      'Regla SIMC, controlador PI; λ por defecto (= θ = 10 s).',
      'Bloque de destino: genérico ideal (ISA).',
    ],
    result: 'Kc = 1,5, Ti = 45 s. En «Para cargar en…» salen P, I y D en las unidades de tu bloque (con el motivo si I o D quedan en 0, p. ej. por elegir PI); compara la simulación con la respuesta real del lazo.',
  },
  limits: [
    'El modelo es de primer orden con tiempo muerto (o integrador con tiempo muerto): procesos muy oscilatorios o con respuesta inversa no se describen bien.',
    'Ziegler-Nichols y Cohen-Coon están pensados para decaimiento 1/4, o sea respuestas muy oscilantes; prefiere Lambda o SIMC si quieres un lazo más amortiguado.',
    'La prueba de escalón debe hacerse con el lazo en manual, el proceso estable y sin perturbaciones; un escalón demasiado pequeño se pierde en el ruido.',
    'Ms (pico de sensibilidad): 1,2-1,4 robusto, 1,4-1,7 normal, más de 2 frágil ante cambios del proceso. Si cambia con la carga, sintoniza para el caso peor.',
    'Antes de dejar el lazo en automático, verifica el sentido de la acción (directa o inversa) y prueba con un escalón pequeño de consigna.',
  ],
  standards: [
    'Lambda / IMC: Rivera, Morari y Skogestad (1986); SIMC: Skogestad (2003); Ziegler-Nichols (1942), Cohen-Coon (1953), Tyreus-Luyben (1992).',
    'Identificación de dos puntos (Smith) y robustez validadas contra la tabla de Skogestad 2003.',
    'Unidades de cada bloque: documentación del fabricante (ver el aviso de fiabilidad debajo).',
  ],
  reliability: [
    { level: 'ok', text: 'Logix PID y PIDE (dependiente e independiente) y las formas genéricas: unidades verificadas en la documentación del fabricante. Rockwell no aclara si el error se calcula en % del span o en unidades de PV: confirma Kc con un escalón pequeño en automático.' },
    { level: 'warn', text: 'Micro800 (instrucción PID) y Modicon M221: unidades probables, deducidas de documentación incompleta. Verifícalas en la ayuda de tu software.' },
    { level: 'bad', text: 'Micro800 IPIDCONTROLLER y Modicon M340 (PIDFF): forma y unidades NO verificadas. No cargues los valores sin comprobarlos primero en la ayuda de tu software y con un escalón pequeño en automático.' },
  ],
};
