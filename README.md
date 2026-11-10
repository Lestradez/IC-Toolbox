# I&C Toolbox

Navaja suiza **offline** para instrumentistas de instrumentación y control.
Es una PWA (HTML + JS sin dependencias): se instala desde el navegador en Android
y escritorio y funciona sin conexión.

**App:** https://lestradez.github.io/IC-Toolbox/

## Herramientas

| Herramienta | Estado |
|---|---|
| Conversor de unidades (presión, temperatura, caudal volumétrico y másico, nivel) | ✅ |
| Escalado de señales: 4-20 mA, 0-10 V, 3-15 psi… (presets) o cualquier magnitud/unidad ↔ %, raíz cuadrada, NAMUR NE 43 | ✅ |
| Placa orificio ISO 5167-2: caudal (líquido, crudo + agua, gas con ε), dimensionamiento de d, caudal desde rango | ✅ |
| RTD (Pt100/500/1000 IEC 60751, Ni100/Ni1000 DIN 43760, Ni120) y termopares J, K, T, E, N, R, S, B (ITS-90): °C ↔ Ω / mV, cables a 2 hilos, junta fría y puntos de calibración | ✅ |
| Nivel por ΔP: LRV y URV con supresión o elevación de cero (tanque abierto/cerrado, pierna seca o húmeda, sellos remotos, transmisor por debajo de la toma), tabla de puntos con mA | ✅ |
| Sintonía PID: modelo desde una prueba de escalón (autorregulado o integrador), modelo conocido o ciclo sostenido; reglas Lambda/IMC, SIMC, Ziegler-Nichols, Cohen-Coon, Tyreus-Luyben; robustez (Ms, márgenes) y respuesta simulada; parámetros en las unidades de Logix PID/PIDE, Micro800, M221 y M340 | ✅ |
| Tablas de densidades | Pendiente |

> Las herramientas son de apoyo. Verifica los resultados críticos contra la norma
> o el software de cálculo validado de tu planta.

## Flujo de trabajo

- Cada cambio se hace en una rama propia y entra a `main` mediante PR.
  El PR ejecuta los tests (`.github/workflows/ci.yml`, check `test`).
- `main`: producción. Cada push a `main` ejecuta los tests y despliega en GitHub Pages
  (`.github/workflows/pages.yml`).
- Si hace falta probar algo antes de ir a `main`, se crea una rama temporal y se borra después.

## Estadísticas y reportes

- **Uso anónimo** con [GoatCounter](https://www.goatcounter.com) (sin cookies ni identificadores): cuenta qué herramientas se abren y los errores de JavaScript. Nunca se envían los valores de las calculadoras. El código del sitio está en `js/config.js` (`GOATCOUNTER_CODE`), y solo funciona en el sitio publicado, no en localhost. El usuario puede desactivarlo en el pie, y se respeta «No rastrear». Sin conexión los envíos se guardan en una cola y salen al volver.
- **Reportar un problema**: botón en el pie. Abre un popup con dos opciones: issue de GitHub (herramienta, versión y navegador ya rellenados) o un formulario de Google para quien no tiene cuenta. El formulario se activa poniendo su enlace en `js/config.js` (`FORM_URL`, `FORM_FIELDS`); mientras esté vacío, el botón abre GitHub directo.

## Desarrollo local

```bash
npm test          # tests de cálculo y de publicación (node --test, sin dependencias)
npm start         # construye _site/ y lo sirve en http://localhost:8080
npm ci && npx playwright install chromium
npm run test:e2e  # test de humo en Chromium: rutas, offline y aviso de actualización
```

Los cálculos viven en módulos puros (`js/units.js`, `js/orifice.js`, `js/pipes.js`, `js/temperature.js`, `js/pid.js`…) sin DOM, para poder testearlos.

### Añadir una herramienta

1. Cálculo en un módulo puro con tests (`js/<algo>.js` + `tests/<algo>.test.js`).
2. Vista en `js/tools/<id>/view.js` que exporte `mount(section)`: pinta su HTML y conecta eventos.
   Para recordar los datos entre sesiones usa `loadState`/`saveState` de `js/ui.js`.
3. Una entrada en `js/tools/registry.js` (título, descripción, categoría, palabras clave).

El inicio, el buscador, la cabecera y la precarga offline salen del registro: no hay que tocar
`index.html` ni `sw.js`. Cada vista se descarga la primera vez que se abre.
Los casos de referencia de la placa orificio se generan con la librería independiente `fluids`
(`scripts/orifice_reference.py`).
`scripts/build.mjs` genera el sitio publicable: rellena en `sw.js` la lista de precache
(todo lo que hay en `css/`, `js/` e `icons/`) y una versión de caché con un hash del contenido.
No hay que tocar versiones a mano para que los móviles se actualicen: cualquier cambio produce
una versión nueva, que se descarga en segundo plano y se activa cuando el usuario pulsa
«Actualizar». Sube `version` en `package.json` solo para nombrar la release.

Los iconos se regeneran con `python3 scripts/make_icons.py` (requiere Pillow) y las capturas
del manifest con `node scripts/make_screenshots.mjs` (requiere Playwright).

Piezas de interfaz compartidas en `js/components.js`: tarjeta de resultado con barra fija
(`resultCardHTML` + `bindResultCard`), botón ± para negativos (`<input data-signed>` +
`enhanceSigned`), copiar al portapapeles y avisos con «Deshacer» (`toast`).

## Licencia

MIT
