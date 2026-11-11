# ROADMAP — I&C Toolbox

Estado de partida: **v0.3.0**, `main` en `7411823` (PR #18), 11 de noviembre de 2026.
En ese commit pasan **143 tests de cálculo** (`npm test`) y **15 tests de humo** en Chromium
(`npm run test:e2e`).

## Cómo se usa este archivo

- **Fase 1 `[x]`**: lo que ya está en `main` y funciona. Es el registro del estado base; no se toca.
- **Fase 2 `[ ]`**: cola secuencial. Cuando Omar pide avanzar, Claude toma **solo la primera `[ ]`
  de la Fase 2**, la implementa, corre su verificación y, si pasa, la marca `[x]` **en el mismo PR**
  que la implementa. Un ítem = un PR.
- **Bloqueadas**: necesitan un dato o una decisión de Omar. No están en la cola para que no la
  frenen. Cuando llega el dato, el ítem pasa a la Fase 2 en el lugar que Omar diga.
- **Fase 3 (diferido)**: decidido para más adelante; no se trabaja hasta que Omar lo reactive.
- **Pedidos nuevos**: primero se añaden aquí como `[ ]` en su sección (en el mismo PR o en uno
  previo) y solo después se escribe código.
- **Verificación base de cualquier ítem** (además de la propia): `npm test` y `npm run test:e2e`
  en verde, que es lo que corre el check `test` del PR. Toda herramienta nueva lleva su `help.js`
  y su ejemplo resuelto en `tests/help.test.js` (lo exige ese test).
- Para correr el e2e en local sin `npm ci`:
  `ln -s "$(npm root -g)/playwright" node_modules/playwright && npm run test:e2e`.
- **IDs**: cada ítem tiene un número fijo (`1.4`, `2.3`, `B2`, `3.1`) para nombrarlo en comentarios
  y PRs. No se renumera: un ítem nuevo toma el siguiente número libre de su sección.
- **Comentarios**: sobre el artefacto «Roadmap I&C Toolbox» (botón «Comentar» en cada ítem) o en el
  PR, línea por línea. Claude los integra aquí y vuelve a publicar el artefacto. Este archivo
  manda: el artefacto es una vista de él.

---

## Fase 1 — Completado

### Plataforma

- [x] **1.1** PWA instalable sin dependencias de ejecución: `index.html`, `manifest.webmanifest`, iconos
      normal y *maskable* (`scripts/make_icons.py`), capturas del instalador
      (`scripts/make_screenshots.mjs`). — PR #1
- [x] **1.2** Offline fiable: `sw.js` cache-first con lista de precache y versión de caché generadas por
      `scripts/build.mjs` (hash del contenido), sin archivos viejos y aviso «Actualizar» cuando
      hay versión nueva. — PR #3. Verificado en `tests/build.test.js` y en los e2e
      «funciona sin conexión» y «el aviso de versión nueva actualiza la app».
- [x] **1.3** Base escalable: registro de herramientas (`js/tools/registry.js`) con carga diferida
      (`import()`), inicio por categorías con buscador sin acentos, recientes, botón atrás y
      tema claro/oscuro elegible. — PR #4. `tests/registry.test.js`.
- [x] **1.4** Usabilidad en campo (`js/components.js`): barra de resultado fija, botón ± para negativos,
      copiar al portapapeles, avisos con «Deshacer»; datos recordados entre sesiones
      (`loadState`/`saveState` de `js/ui.js`); coma o punto decimal (`tests/ui.test.js`). — PR #5
- [x] **1.5** CI y publicación: `.github/workflows/ci.yml` (check `test`: tests + e2e en cada PR) y
      `.github/workflows/pages.yml` (tests + deploy de `main` a
      https://lestradez.github.io/IC-Toolbox/). Flujo sin rama `dev`. — PR #8
- [x] **1.6** Ayuda dentro de la app: botón «?» por herramienta (`js/tools/<id>/help.js`, render en
      `js/help.js`), guía de inicio (`js/guide.js`) y test que exige ayuda completa y recalcula
      cada ejemplo resuelto (`tests/help.test.js`). — PR #15
- [x] **1.7** Estadísticas anónimas con GoatCounter (código `lestradez`, sin valores de calculadoras,
      cola offline, errores JS máx. 5 por sesión, desactivable, respeta «No rastrear»):
      `js/analytics.js`, `js/config.js`. — PR #10. `tests/analytics.test.js`.
- [x] **1.8** «Reportar un problema»: popup con issue de GitHub prellenado o Google Form prellenado con
      herramienta y versión (`js/report.js`, `js/config.js`). — PR #10 y #18

### Herramientas

- [x] **1.9 Conversor de unidades** (`js/units.js`, `js/tools/units/`): presión (16 unidades),
      temperatura, caudal volumétrico y másico, nivel/longitud. — PR #1. `tests/units.test.js`.
- [x] **1.10 Escalado de señales** (`js/signal.js`, `js/tools/signal/`): presets 4-20 mA, 0-10 V,
      1-5 V, 3-15 psi, 0,2-1 bar…, cualquier magnitud/unidad ↔ %, raíz cuadrada, rango invertido,
      NAMUR NE 43. — PR #6. `tests/signal.test.js`.
- [x] **1.11 Placa orificio ISO 5167-2** (`js/orifice.js`, `js/pipes.js`, `js/tools/orifice/`): caudal
      (líquido, crudo + agua con BSW, gas con ε), dimensionamiento de d, caudal desde rango,
      límites de validez e incertidumbre de C y ε, tuberías ASME B36.10M. Contrastado con la
      librería independiente `fluids` (`scripts/orifice_reference.py`). — PR #2.
      `tests/orifice.test.js`.
- [x] **1.12 RTD y termopares** (`js/temperature.js`, `js/tools/temperature/`): Pt100/500/1000
      (IEC 60751), Ni100/Ni1000 (DIN 43760), Ni120 (tabla Minco); termopares J K T E N R S B
      (ITS-90); °C ↔ Ω / mV, cables a 2 hilos, junta fría, puntos de calibración. — PR #7.
      `tests/temperature.test.js`. *Valores de referencia de los tests sin contrastar contra una
      tabla oficial: ver Bloqueadas B4.*
- [x] **1.13 Estadística de calibración** (`js/calibration.js`, `js/tools/calibration/`): media, s,
      incertidumbre tipo A, k de Student con Welch-Satterthwaite (GUM), veredicto ILAC-G8, error
      total probable RSS, `calibrationRun` multipunto con histéresis. — PR #9.
      `tests/calibration.test.js`.
- [x] **1.14 Nivel por ΔP** (`js/level.js`, `js/tools/level/`): LRV/URV con supresión o elevación de
      cero (abierto, sello, pierna seca, pierna húmeda, dos sellos), entradas por cotas del tanque,
      escalado del PLC, zona muerta y esquema SVG (`js/tools/level/diagram.js`). — PR #11 y #16.
      `tests/level.test.js`. *Casos calculados a mano: ver Bloqueadas B5.*
- [x] **1.15 Sintonía PID** (`js/pid.js`, `js/tools/pid/`): identificación por escalón (autorregulado
      e integrador), modelo conocido o ciclo sostenido; Lambda/IMC, SIMC, Ziegler-Nichols,
      Cohen-Coon, Tyreus-Luyben; robustez (Ms, márgenes, validada contra Skogestad 2003);
      respuesta simulada; bloque P/I/D listo para cargar. — PR #12 y #14. `tests/pid.test.js`.
      *Unidades verificadas solo para Logix PID/PIDE: ver Bloqueadas B1–B3.*
- [x] **1.16 Densidades de fluidos** (`js/densities.js`, `js/densities-data.js` generado por
      `scripts/densities_reference.py`, `js/tools/densities/`): agua, orgánicos, glicoles, gases
      licuados, petróleo (°API, API 11.1), gases (Peng-Robinson), vapor saturado; selector
      «Elegir de la tabla» en Nivel y Placa orificio. — PR #13. `tests/densities.test.js`.
      *Mercurio sin fuente primaria: ver Bloqueadas B6.*
- [x] **1.17 Planilla de calibración** (`js/calsheet.js`, `js/xlsx.js`, `js/tools/calsheet/`):
      as found / as left, subida y bajada, error % span, histéresis, U del patrón opcional con
      TUR, guardado local, exportación a Excel propio (sin dependencias) y PDF por impresión.
      — PR #17. `tests/calsheet.test.js`, `tests/xlsx.test.js` y e2e «planilla de calibración».

---

## Fase 2 — Cola pendiente (en orden)

> Los ítems marcados *(propuesta)* no los pidió Omar: salen del análisis del código y de los
> límites que cada herramienta ya declara en su ayuda. Se pueden tachar o reordenar comentando.

- [ ] **2.1 README al día y test que lo mantenga.** El README no lista «Estadística de
      calibración» ni «Planilla de calibración». Añadirlas a la tabla y un test que falle si
      una herramienta del registro no aparece en el README.
      - Archivos: `README.md`, `tests/registry.test.js`.
      - Verificación: `node --test tests/registry.test.js` (el test nuevo falla sin el cambio del
        README y pasa con él).

- [ ] **2.2 Respaldo JSON de las planillas guardadas.** Hoy viven solo en `localStorage`
      (`ict.calsheet.saved`): si se borran los datos del navegador, se pierden. Botón «Exportar
      respaldo» (un `.json` con todas) e «Importar respaldo» (une por id, pregunta antes de
      pisar, valida con `normalizeDoc`).
      - Archivos: `js/calsheet.js` (funciones puras `backupJson` / `parseBackup`),
        `js/tools/calsheet/view.js`, `js/tools/calsheet/help.js`, `tests/calsheet.test.js`,
        `tests/e2e/smoke.e2e.js`.
      - Verificación: `node --test tests/calsheet.test.js` (ida y vuelta, archivo roto, versión
        vieja) y `node --test --test-concurrency=1 --test-name-pattern "planilla" tests/e2e/smoke.e2e.js`.

- [ ] **2.3 Tolerancia de RTD según IEC 60751** (clases AA, A, B, C, con su rango de validez):
      ±°C y ±Ω en el resultado y en los puntos de calibración.
      - Archivos: `js/temperature.js` (`rtdTolerance(cls, t)`), `js/tools/temperature/view.js`,
        `js/tools/temperature/help.js`, `tests/temperature.test.js`, `tests/help.test.js`.
      - Verificación: `node --test tests/temperature.test.js tests/help.test.js` (valores en
        0, 100 y 200 °C por clase, y fuera de rango de la clase = aviso).

- [ ] **2.4 Tolerancia de termopares según IEC 60584-1** (clases 1, 2 y 3 por tipo).
      - Archivos: `js/temperature.js` (`tcTolerance(type, cls, t)`),
        `js/tools/temperature/view.js`, `js/tools/temperature/help.js`,
        `tests/temperature.test.js`.
      - Verificación: `node --test tests/temperature.test.js` (cambio de fórmula fija ↔ % de t
        en el punto de corte de cada tipo y clase).

- [ ] **2.5 °F en RTD y termopares** *(propuesta)*: elegir °C o °F para temperatura y junta fría.
      - Archivos: `js/tools/temperature/view.js` (reusar `convert` de `js/units.js`),
        `tests/e2e/smoke.e2e.js`.
      - Verificación: `node --test --test-concurrency=1 --test-name-pattern "RTD" tests/e2e/smoke.e2e.js`
        (Pt100 a 212 °F = 138,51 Ω).

- [ ] **2.6 Planilla de calibración con salida de raíz cuadrada** *(propuesta)*: para
      transmisores de ΔP de caudal; hoy la ayuda dice «salida lineal, calcúlala a mano».
      - Archivos: `js/calsheet.js` (`expectedOutput` con `sqrt`, guardado en el documento),
        `js/tools/calsheet/view.js`, `js/tools/calsheet/help.js`, `tests/calsheet.test.js`.
      - Verificación: `node --test tests/calsheet.test.js` (25 % de ΔP → 50 % de salida = 12 mA;
        planillas viejas sin el campo siguen lineales).

- [ ] **2.7 Conversor: manométrica ↔ absoluta y diferencias de temperatura** *(propuesta)*:
      presión atmosférica editable (1,01325 bar por defecto) y modo ΔT (1 °C = 1,8 °F sin
      desfase). Hoy ambos son «límites» de la ayuda.
      - Archivos: `js/units.js`, `js/tools/units/view.js`, `js/tools/units/help.js`,
        `tests/units.test.js`.
      - Verificación: `node --test tests/units.test.js` (10 barg = 11,01325 bara; ΔT 10 °C = 18 °F).

- [ ] **2.8 Referencias: código de colores de resistencias** (idea de Omar, «para luego»):
      primera herramienta de la categoría «Referencias», que hoy existe en `CATEGORIES` pero está
      vacía. Bandas → valor y tolerancia, y valor → bandas (4 y 5 bandas, IEC 60062).
      - Archivos: `js/resistors.js`, `js/tools/resistors/{view,help}.js`,
        `js/tools/registry.js`, `tests/resistors.test.js`, `tests/help.test.js`.
      - Verificación: `node --test tests/resistors.test.js tests/help.test.js tests/registry.test.js`
        y e2e «cada herramienta carga sin errores».

- [ ] **2.9 Referencias: colores de cables de termopar** *(propuesta)*: IEC 60584-3 frente a
      ANSI MC96.1 por tipo (positivo, negativo, funda), con enlace desde RTD y termopares.
      - Archivos: `js/tools/tccolors/{view,help}.js`, `js/tools/registry.js`,
        `tests/registry.test.js`, `tests/help.test.js`.
      - Verificación: `node --test tests/registry.test.js tests/help.test.js` y e2e «cada
        herramienta carga sin errores».

- [ ] **2.10 Manifest al día** *(propuesta)*: la descripción solo nombra conversiones, 4-20 mA y
      placa orificio; los atajos no incluyen las herramientas nuevas y las capturas son de antes
      de PR #11. Actualizar descripción, atajos (máx. 4) y regenerar capturas.
      - Archivos: `manifest.webmanifest`, `screenshots/*.png`, `scripts/make_screenshots.mjs`.
      - Verificación: `node scripts/make_screenshots.mjs` y `node --test tests/build.test.js`
        (atajos y capturas apuntan a algo que existe y con el tamaño declarado).

---

## Bloqueadas — necesitan un dato o una decisión de Omar

- [ ] **B1. PID Micro850 `IPIDCONTROLLER`: forma y unidades.** Hoy marcado «NO VERIFICADO».
      - Falta: captura de la ayuda de CCW del bloque (forma, unidades de Ti/Td, sentido).
      - Archivos: `js/pid.js` (`CONTROLLERS`), `js/tools/pid/help.js` (`reliability`),
        `tests/pid.test.js`.
      - Verificación: `node --test tests/pid.test.js tests/help.test.js` con un caso tomado de la
        captura; el aviso pasa de `bad` a `ok`.

- [ ] **B2. PID Modicon M340 `PIDFF`: `mix_par`, `rev_dir` y unidades de `ti`/`td`.**
      - Falta: captura de la ayuda de Control Expert.
      - Archivos y verificación: como B1.

- [ ] **B3. PID Micro800 (instrucción PID) y M221: confirmar unidades** (hoy `warn`; M221 con
      Kp×0,01 y Ti/Td×0,1 s heredado de Twido).
      - Falta: captura de la ayuda de CCW y de EcoStruxure Machine Expert Basic.
      - Archivos y verificación: como B1.

- [ ] **B4. Contrastar los valores de referencia de RTD y termopares** de
      `tests/temperature.test.js` contra una tabla oficial (NIST/IEC 60584-1 e IEC 60751). Los
      coeficientes vienen de un paquete público, pero los valores de los tests no se compararon
      con una tabla impresa.
      - Falta: que Omar coteje los puntos contra la tabla que use en su trabajo (o la pase).
      - Archivos: `tests/temperature.test.js`.
      - Verificación: `node --test tests/temperature.test.js` con los valores cotejados.

- [ ] **B5. Contrastar Nivel por ΔP con una hoja real** (Rosemount, Endress+Hauser o de planta):
      los casos de `tests/level.test.js` están calculados a mano.
      - Falta: una hoja de calibración real con cotas, densidades y LRV/URV.
      - Archivos: `tests/level.test.js`, `js/tools/level/help.js` (ejemplo resuelto).
      - Verificación: `node --test tests/level.test.js tests/help.test.js` con ese caso.

- [ ] **B6. Densidad del mercurio con fuente primaria** (hoy constantes de memoria, aviso `bad`).
      - Falta: decidir la fuente (p. ej. tabla del NIST o del CRC Handbook) o quitar el mercurio.
      - Archivos: `js/densities.js` (`MERCURY`), `js/tools/densities/help.js`,
        `tests/densities.test.js`.
      - Verificación: `node --test tests/densities.test.js tests/help.test.js`.

- [ ] **B7. Campo «navegador» en el Google Form de reportes.** `FORM_FIELDS.browser` está vacío.
      - Falta: que Omar añada el campo al formulario y pase el `entry.NNNN`.
      - Archivos: `js/config.js`, `tests/analytics.test.js`.
      - Verificación: `node --test tests/analytics.test.js` (`formUrl` incluye el navegador).

- [ ] **B8. Nivel por ΔP: ¿100 % calibrable por debajo de la cota superior?** (p. ej. bajo el aro
      del techo). Sin decidir si hace falta.
      - Falta: decisión de Omar.
      - Archivos: `js/level.js` (`tankRange`), `js/tools/level/view.js`,
        `js/tools/level/diagram.js`, `tests/level.test.js`.
      - Verificación: `node --test tests/level.test.js` (100 % a 8,5 m en un tanque de 9 m).

### Limitaciones aceptadas (no son tareas)

- Petróleo API MPMS 11.1: comprobado contra una implementación pública, no contra la norma (de
  pago). No sirve para transferencia de custodia y la ayuda lo dice.
- Gases con Peng-Robinson (≈1 % hasta 10 bar, ≈3 % a 40 bar); sin AGA8 ni fluidos de relleno de
  capilar.

---

## Fase 3 — Diferido

- [ ] **3.1 Dominio propio** para la TWA (sugerido `ictoolbox.com.ar`; Omar tiene
      `lestradez.com.ar` en Hostinger) apuntando a GitHub Pages.
      - Archivos: `CNAME` (si se publica desde Pages), `scripts/build.mjs` (publicarlo),
        `manifest.webmanifest` (`id`, `start_url`, `scope`).
      - Verificación: `curl -sI https://<dominio>/` → 200 y `node --test tests/build.test.js`.
- [ ] **3.2 `/.well-known/assetlinks.json` en la raíz del dominio** con la huella SHA-256 de la
      firma de la app.
      - Verificación: `curl -s https://<dominio>/.well-known/assetlinks.json` y la herramienta
        *Statement List Tester* de Google.
- [ ] **3.3 Empaquetar la TWA con Bubblewrap** y publicar en Google Play (ficha, capturas,
      política de privacidad que explique GoatCounter).
      - Verificación: la app abre a pantalla completa, sin barra de URL, y funciona sin red.
- [ ] **3.4 Versión pro privada** (usuarios, base de datos): repo privado que use este núcleo
      público como dependencia, no como fork (un fork de un repo público no puede ser privado).

### Descartado

- Chrome Web Store: no publica PWAs; la app se instala desde el navegador.
