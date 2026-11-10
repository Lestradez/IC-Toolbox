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
npm test          # tests de cálculo (node --test, sin dependencias)
npm start         # sirve en http://localhost:8080
```

Los cálculos viven en módulos puros (`js/units.js`, `js/orifice.js`, `js/pipes.js`) sin DOM, para poder testearlos.
Los casos de referencia de la placa orificio se generan con la librería independiente `fluids`
(`scripts/orifice_reference.py`).
Al publicar una versión, sube `CACHE_VERSION` en `sw.js` y `APP_VERSION` en `js/app.js`
para que los móviles descarguen la nueva versión.

Los iconos se regeneran con `python3 scripts/make_icons.py` (requiere Pillow).

## Licencia

MIT
