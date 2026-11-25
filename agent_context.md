# agent_context.md — bitácora de I&C Toolbox

Estado y decisiones. Las tareas abiertas viven en `ROADMAP.md`; aquí no se duplican.
Se actualiza solo si cambió el estado, se tomó una decisión o cambiaron las tareas (ver `AGENTS.md`).
Antes de creer este archivo, comprobar `git log -10`.

## Estado actual

- **Versión:** 0.3.0 (`package.json`). `main` en `57cb906` (merge del PR #20), 25 de noviembre de 2026.
- **Publicado en:** https://lestradez.github.io/IC-Toolbox/ (GitHub Pages, deploy automático desde `main`).
- **Herramientas (10):** conversor de unidades, escalado de señales, placa orificio ISO 5167-2,
  RTD y termopares, estadística de calibración, planilla de calibración, nivel por ΔP,
  sintonía PID, densidades de fluidos, nivel de burbuja y brújula. Detalle y PR de cada una:
  Fase 1 del ROADMAP.
- **Tests (25-nov-2026, sin cambios de código):** `npm test` 155/155 y `npm run test:e2e` 17/17.
- **PR abiertos:** ninguno al iniciar la auditoría de estructura y documentación.
- **Sin verificar en dispositivo real:** nivel de burbuja y brújula (solo eventos simulados en Chromium).
- **Configuración manual en GitHub** (no visible en el repo): Pages con origen «GitHub Actions»;
  `main` protegida con el check `test`.

## Decisiones

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-11-10 | Una sola PWA, offline con service worker, sin dependencias de ejecución. | Se usa en planta, sin red; sin dependencias no hay nada que mantener ni auditar. |
| 2026-11-10 | Sin rama `dev`: rama de feature → PR → `main`. | Decisión de Omar; `dev` se eliminó. Se recrea solo si hace falta probar algo antes de `main`. |
| 2026-11-10 | Chrome Web Store descartada. | No publica PWAs; la app se instala desde el navegador. |
| 2026-11-10 | Play (TWA con Bubblewrap) pospuesto; se queda en `lestradez.github.io/IC-Toolbox/`, sin repo `lestradez.github.io`. | La TWA necesita `assetlinks.json` en la raíz del dominio. Al ir a Play: dominio propio (sugerido `ictoolbox.com.ar`). Ver Fase 3. |
| 2026-11-10 | La ayuda va dentro de la app (botón «?» por herramienta), no en un manual aparte. | Un manual aparte se desfasa; la ayuda dentro de la app funciona offline y un test la mantiene al día. |
| 2026-11-10 | Planilla de calibración genérica, no réplica del Excel de la empresa de Omar; U del patrón opcional. | Pedido de Omar. |
| 2026-11-10 | Lo no verificado se declara («NO VERIFICADO», avisos `reliability`) o se bloquea. | No inventar datos en una herramienta que se usa para decisiones de planta. |
| 2026-11-10 | PLCs que Omar usa: ControlLogix, CompactLogix, Micro850 (Allen-Bradley); M340 y M221 (Schneider). | Orienta la sintonía PID y futuras herramientas de control. |
| 2026-11-11 | `ROADMAP.md` es la fuente de verdad; el artefacto «Roadmap I&C Toolbox» es solo una vista. | Un mapa único y comentable. |
| 2026-11-23 | Nivel de burbuja y brújula aprobados. Medición por AR: solo registro en Fase 3 (3.5). | iOS no soporta WebXR; no sirve para todos. |
| 2026-11-25 | Se añaden `AGENTS.md`, `CLAUDE.md`, esta bitácora y `docs/ARQUITECTURA.md`; el protocolo sale del ROADMAP a `AGENTS.md`. | El ROADMAP mezclaba reglas de la cola con el protocolo de trabajo. |

## Tareas abiertas

Ver `ROADMAP.md`: cola en la Fase 2, datos que faltan en «Bloqueadas», diferido en la Fase 3.
