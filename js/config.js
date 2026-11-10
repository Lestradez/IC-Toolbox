// Configuración de publicación.

/** Repositorio donde se abren los reportes de problemas. */
export const REPO = 'Lestradez/IC-Toolbox';

/**
 * Código del sitio en GoatCounter (https://CODIGO.goatcounter.com). Vacío = estadísticas
 * apagadas: la app no envía nada. Es público por diseño (va en el código de cualquier
 * página que use GoatCounter), no es un secreto.
 */
export const GOATCOUNTER_CODE = 'lestradez';

/**
 * Formulario alternativo para quien no tiene cuenta de GitHub (Google Forms).
 * FORM_URL: enlace «viewform» del formulario. Vacío = el botón Reportar abre GitHub directo.
 * FORM_FIELDS: ids `entry.NNNN` de los campos a prellenar (se sacan con «Obtener enlace
 * prellenado»). Los que queden vacíos no se rellenan.
 */
export const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf5VAWQlj31bij0Qoj7fx8VfhmMDI7qCWTH23RcQETtzD8mfA/viewform';
export const FORM_FIELDS = { tool: 'entry.156488016', version: 'entry.1456596696', browser: '' };
