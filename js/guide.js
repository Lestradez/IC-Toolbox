// Guía corta de inicio: instalar, usar sin conexión, reportar. Se abre sola la primera
// vez (banner del inicio) y desde el «?» de la página principal.
export const guide = {
  summary: 'I&C Toolbox son calculadoras de instrumentación que funcionan sin conexión una vez cargadas. Lo esencial en un minuto:',
  sections: [
    {
      heading: 'Instalarla en el móvil',
      items: [
        'Android (Chrome): menú ⋮ → «Instalar aplicación» (o «Añadir a la pantalla de inicio»). Queda como una app más.',
        'iPhone (Safari): botón Compartir → «Añadir a pantalla de inicio».',
        'También funciona sin instalar, abriendo la dirección en el navegador.',
      ],
    },
    {
      heading: 'Sin conexión',
      items: [
        'Ábrela una vez con internet: la primera carga guarda todas las herramientas en el teléfono. Después funciona en un cuarto de control o a pie de tanque sin cobertura.',
        'Cuando no hay red, aparece «Sin conexión» arriba. Todos los cálculos se hacen en el dispositivo.',
        'Si hay una versión nueva, sale un aviso con «Actualizar». No cambia sola, para no interrumpirte a mitad de una medición.',
      ],
    },
    {
      heading: 'Usarla',
      items: [
        'En el inicio, busca por lo que necesitas (por ejemplo «4-20», «psi», «pierna húmeda»); Enter abre la primera coincidencia. Las últimas herramientas quedan en «Recientes».',
        'Cada herramienta tiene su propio «?» arriba a la derecha: qué calcula, qué pide cada dato, un ejemplo resuelto y los límites de validez.',
        'Admite coma o punto decimal. Los datos que escribes se guardan en el dispositivo; no se envían a ningún sitio.',
        '«Copiar resultado» deja el cálculo como texto para pegarlo en un informe o un mensaje.',
        'El tema (claro, oscuro o el del sistema) se cambia en el pie de página.',
      ],
    },
    {
      heading: 'Fíate con criterio',
      items: [
        'Son ayudas de cálculo, no sustituyen la hoja de datos ni el procedimiento de tu planta. Contrasta los resultados críticos con la documentación del fabricante.',
        'Cuando un cálculo depende de datos aproximados o sin verificar, la herramienta lo avisa en su ayuda.',
      ],
    },
    {
      heading: 'Reportar un problema',
      items: [
        '«Reportar un problema», al pie, abre un reporte con la herramienta y la versión ya indicadas. Sirve también para pedir una herramienta o señalar un valor incorrecto.',
        '«Uso anónimo», si aparece al pie, cuenta visitas sin datos personales; puedes desmarcarlo.',
      ],
    },
  ],
};
