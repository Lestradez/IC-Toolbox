# I&C Toolbox

Navaja suiza **offline** para instrumentistas de instrumentación y control.
Es una PWA (HTML + JS sin dependencias): se instala desde el navegador en Android
y escritorio y funciona sin conexión.

**App:** https://lestradez.github.io/IC-Toolbox/

## Herramientas

| Herramienta | Estado |
|---|---|
| Conversor de unidades (presión, temperatura, caudal volumétrico y másico, nivel) | ✅ |
| Señal 4-20 mA ↔ % ↔ valor de proceso, raíz cuadrada, NAMUR NE 43 | ✅ |
| Placa orificio ISO 5167-2: caudal (líquido, crudo + agua, gas con ε), dimensionamiento de d, caudal desde rango | ✅ |
| Tablas de densidades | Pendiente |

> Las herramientas son de apoyo. Verifica los resultados críticos contra la norma
> o el software de cálculo validado de tu planta.

## Flujo de trabajo

- `dev`: desarrollo. Todo cambio entra aquí.
- `main`: producción. Solo se actualiza mediante PR desde `dev`.
  Cada push a `main` ejecuta los tests y despliega en GitHub Pages
  (`.github/workflows/pages.yml`).

## Desarrollo local

```bash
npm test          # tests de cálculo y de publicación (node --test, sin dependencias)
npm start         # construye _site/ y lo sirve en http://localhost:8080
npm ci && npx playwright install chromium
npm run test:e2e  # test de humo en Chromium: rutas, offline y aviso de actualización
```

Los cálculos viven en módulos puros (`js/units.js`, `js/orifice.js`, `js/pipes.js`) sin DOM, para poder testearlos.

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

Los iconos se regeneran con `python3 scripts/make_icons.py` (requiere Pillow).

## Licencia

MIT
