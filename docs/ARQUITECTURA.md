# Arquitectura — I&C Toolbox

Por qué está armado así. Las rutas y convenciones están en `AGENTS.md`; el estado, en
`agent_context.md`; lo que sigue, en `ROADMAP.md`.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Plataforma | PWA instalable desde el navegador, sin paso de compilación y sin dependencias de ejecución. | Se usa en planta, sin red y en móviles de gama media. No hay nada que actualizar ni auditar. |
| Offline | `sw.js` cache-first; `scripts/build.mjs` genera la lista de precache y una versión de caché con hash del contenido. | Cualquier cambio produce una versión nueva sin tocar números a mano. |
| Actualización | El service worker nuevo espera: la app avisa y se activa cuando el usuario pulsa «Actualizar». | No cambiar la app mientras alguien está midiendo. |
| Herramientas | Registro (`js/tools/registry.js`) con carga diferida (`import()`); cada una = módulo de cálculo puro + `view.js` + `help.js`. | Añadir una herramienta no toca la cáscara; el cálculo se testea sin DOM. |
| Navegación | Router por hash (`#/<id>`), buscador sin acentos, recientes, tema claro/oscuro. | Funciona desde `file://` y Pages sin reglas de servidor. |
| Estado local | `localStorage` con prefijo `ict.` (`loadState`/`saveState`). | Sin cuentas ni servidor. Límite: se pierde si se borran los datos del navegador (ver 2.2 del ROADMAP). |
| Ayuda | Dentro de la app, por herramienta; `tests/help.test.js` exige ayuda completa y recalcula cada ejemplo. | Un manual aparte se desfasa. |
| Cálculo normativo | Contrastado con una implementación independiente cuando existe (`fluids` para ISO 5167, CoolProp para densidades, Skogestad 2003 para robustez PID); lo no contrastado se declara. | Son resultados que se usan en decisiones de planta. |
| Privacidad | GoatCounter sin cookies; nunca se envían valores de las calculadoras. Respeta «No rastrear» y se puede desactivar. | Es una herramienta de campo; los números pueden ser de una planta. |
| Publicación | GitHub Pages desde `main` con Actions (tests + build). | Gratis, sin servidor; sin repo ni dominio aparte por ahora. |
| Flujo | Rama → PR → `main` protegida con el check `test` (tests + e2e). Sin `dev`. | Un solo entorno; el PR es la prueba. |

## Estructura

```
index.html · manifest.webmanifest · sw.js   cáscara PWA (sw.js se rellena al construir)
js/
  app.js                 router, inicio, buscador, tema, aviso de versión
  <modulo>.js            cálculo puro (units, signal, orifice, pipes, temperature, calibration,
                         calsheet, xlsx, level, pid, densities, sensors)
  densities-data.js      generado por scripts/densities_reference.py
  tools/registry.js      catálogo; tools/<id>/{view,help}.js por herramienta
  components.js ui.js help.js guide.js   piezas compartidas
  analytics.js report.js config.js       estadísticas anónimas y reportes
css/ icons/ screenshots/
scripts/                 build.mjs, serve.mjs, referencias en Python, iconos y capturas
tests/                   *.test.js (cálculo, publicación) y e2e/smoke.e2e.js (Chromium)
```

## Presupuesto

Sin objetivos fijados todavía; estos son los valores medidos el 25-nov-2026.

| Medida | Objetivo | Valor actual |
|---|---|---|
| Sitio publicado (`_site/`, con capturas) | sin definir | ≈ 1,1 MB |
| JS + CSS + HTML, comprimido (gzip) | sin definir | ≈ 129 KB |
| Dependencias de ejecución | 0 | 0 |
| Tests | en verde en cada PR | 155 de cálculo, 17 e2e |

## Pendiente y riesgos

- Nivel de burbuja y brújula: probados solo con eventos simulados; falta probarlos con sensores reales
  (Android e iPhone). iOS exige permiso tras un toque.
- Planillas guardadas solo en `localStorage`: sin respaldo (ROADMAP 2.2).
- Valores de referencia sin contrastar con una tabla oficial: RTD y termopares, nivel por ΔP, mercurio
  (ROADMAP B4, B5, B6); unidades PID de varios PLC (B1–B3).
- Publicar en Google Play exige dominio propio y `assetlinks.json` en su raíz (ROADMAP 3.1–3.3).
