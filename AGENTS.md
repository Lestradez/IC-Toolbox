# AGENTS.md — I&C Toolbox

Navaja suiza **offline** para instrumentistas: una PWA en HTML + JavaScript **sin dependencias de
ejecución** (solo `playwright` para el e2e, como dependencia de desarrollo). Idioma de código
comentado, textos y documentación: **español**. Se publica en https://lestradez.github.io/IC-Toolbox/.

El repo manda. Antes de trabajar, leer en este orden: este archivo, `agent_context.md` (estado y
decisiones), `ROADMAP.md` (qué sigue). La memoria del proyecto guarda solo preferencias.

## Estructura

| Ruta | Contenido |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | Cáscara de la PWA. `sw.js` es cache-first; su lista de precache y su versión las rellena `scripts/build.mjs` (no se tocan a mano). |
| `js/app.js` | Router por hash, inicio, buscador, tema, aviso «Actualizar». |
| `js/<modulo>.js` | Cálculo **puro**, sin DOM, con su `tests/<modulo>.test.js` (`units`, `signal`, `orifice`, `pipes`, `temperature`, `calibration`, `calsheet`, `xlsx`, `level`, `pid`, `densities`, `sensors`). |
| `js/densities-data.js` | **Generado** por `scripts/densities_reference.py` (CoolProp). No se edita a mano. |
| `js/tools/registry.js` | Catálogo de herramientas y categorías: de aquí salen inicio, buscador y precarga offline. |
| `js/tools/<id>/view.js` · `help.js` | Vista (`mount(section)`) e instructivo del botón «?» de cada herramienta. |
| `js/components.js`, `js/ui.js`, `js/help.js`, `js/guide.js` | Piezas compartidas, estado local (`loadState`/`saveState`, prefijo `ict.`), render de la ayuda, guía de inicio. |
| `js/analytics.js`, `js/report.js`, `js/config.js` | GoatCounter anónimo, «Reportar un problema», constantes del sitio. |
| `css/`, `icons/`, `screenshots/` | Estilos, iconos (`scripts/make_icons.py`) y capturas del instalador (`scripts/make_screenshots.mjs`). |
| `scripts/` | `build.mjs` (sitio publicable en `_site/`), `serve.mjs` (`npm start`), referencias en Python (`orifice_reference.py`, `densities_reference.py`). |
| `tests/` | `*.test.js` (cálculo y publicación, `npm test`) y `e2e/smoke.e2e.js` (Chromium, `npm run test:e2e`). |
| `.github/workflows/` | `ci.yml` (check `test` en cada PR) y `pages.yml` (tests + deploy de `main`). |
| `ROADMAP.md`, `agent_context.md`, `docs/ARQUITECTURA.md` | Qué sigue, estado y decisiones, y por qué está armado así. |

## Convenciones de código

- Cálculo en módulos puros con tests; la vista solo pinta y conecta eventos.
- **No inventar datos.** Lo que no se contrastó contra una fuente se marca «NO VERIFICADO» en la
  ayuda (`reliability`) o va a «Bloqueadas» del ROADMAP; las limitaciones se declaran en la ayuda.
- Sin dependencias de ejecución; assets propios o con licencia libre.
- Valores de las calculadoras: nunca salen del dispositivo (ni a GoatCounter ni a los reportes).
- **Para agregar una herramienta:** (1) módulo puro `js/<algo>.js` + `tests/<algo>.test.js`;
  (2) `js/tools/<id>/view.js` con `mount(section)`; (3) `js/tools/<id>/help.js` con su ejemplo
  resuelto, y ese ejemplo recalculado en `tests/help.test.js`; (4) una entrada en
  `js/tools/registry.js`. No se toca `index.html` ni `sw.js`.

## Protocolo de trabajo

**Al iniciar.** Leer `agent_context.md` y `ROADMAP.md`, correr `git log -10` y comprobar el estado
real del código antes de creer lo que diga la bitácora o la memoria. Antes de empezar un pedido,
proponer modelo y esfuerzo (o seguir un hilo existente) y esperar el OK de Omar.

**Un ítem = un PR.** Cuando Omar pide «avanzar», se toma solo el primer ítem `[ ]` de la Fase 2 del
ROADMAP (la regla de marcado está en el propio ROADMAP). Los PR salen en secuencia, no en paralelo,
para evitar conflictos. Un pedido nuevo se añade primero al ROADMAP como `[ ]` y después se escribe
código.

**Verificación base de cualquier ítem** (además de la propia del ítem): `npm test` y
`npm run test:e2e` en verde. Es lo que corre el check `test` del PR.

**e2e en local.** Con `npm ci` basta. Sin `npm ci`:
`ln -s "$(npm root -g)/playwright" node_modules/playwright && npm run test:e2e`.
Si falta el navegador: `npx playwright install chromium`.

**Ayuda obligatoria por herramienta.** Toda herramienta lleva su `help.js` con ejemplo resuelto
(lo exige `tests/help.test.js`). Si un cambio toca lo que ve el usuario de una herramienta
existente, actualizar su `help.js` y preguntar a Omar si algo más del instructivo o de la guía
(`js/guide.js`) cambia; recordarlo al cerrar el hilo. No hay manual aparte: la ayuda va dentro de
la app, offline.

**Al terminar.**
1. Correr la verificación y anotar el resultado (`n/n`).
2. Commit con un título en español en oración («Añade nivel de burbuja y brújula (sensores del
   teléfono) y actualiza el ROADMAP»). Sin prefijo de agente ni de área.
3. Rama `claude/project-thread-<id>` → PR a `main` (protegida; check `test`). Título en oración.
   Cuerpo con las secciones **Qué cambia**, **Verificación** (conteos de `npm test` y
   `npm run test:e2e`) y **Pendiente** (lo no verificado en dispositivo o a la espera de Omar).
4. Actualizar `agent_context.md` **solo si** cambió el estado, se tomó una decisión o cambiaron las
   tareas abiertas. Las tareas viven en el ROADMAP, no se duplican en la bitácora.
5. Si el ítem era del ROADMAP, marcarlo `[x]` en el mismo PR con el número de PR.

**Ramas.** No existe `dev`. Si hace falta probar algo antes de `main`, rama temporal que se borra
después. Los agentes no pueden borrar ramas remotas: lo hace Omar en GitHub.

## Despliegue

| Entorno | Destino | Método | URL | Secretos (nombres) | Workflow |
|---|---|---|---|---|---|
| Producción | GitHub Pages | Actions: tests + `node scripts/build.mjs` + `deploy-pages` en cada push a `main` | https://lestradez.github.io/IC-Toolbox/ | ninguno | `.github/workflows/pages.yml` |
| Verificación de PR | — | tests + e2e en Ubuntu, Node 22 | — | ninguno | `.github/workflows/ci.yml` (check `test`) |

Requisitos en GitHub (manuales, no visibles en el repo): Pages con origen «GitHub Actions» y
protección de `main` con el check `test`. Una mudanza de hosting (dominio propio, Play) está
diferida: ver Fase 3 del ROADMAP.

## Hilos

Modelo y esfuerzo se proponen antes de cada hilo (Omar aprueba). Punto de partida:

| Tipo de hilo | Modelo sugerido | Pensamiento |
|---|---|---|
| Cálculo normativo o de precisión (ISO 5167, PID, calibración), auditoría, seguridad | el más capaz disponible | alto |
| Diseño visual / UX | Opus | medio-alto |
| Implementar un ítem del ROADMAP | Sonnet | medio |
| README, ayudas, textos, ajustes menores | Haiku | bajo |
