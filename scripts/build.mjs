#!/usr/bin/env node
// Genera el sitio publicable (por defecto en _site/).
//
// La app no tiene paso de compilación: este script solo copia los archivos y rellena
// en sw.js y js/app.js lo que antes se mantenía a mano:
//   - la lista de precache (todos los archivos publicados),
//   - la versión de caché (versión de package.json + hash del contenido),
//   - la versión que se muestra en el pie.
// Cualquier cambio en un archivo cambia el hash, así que los móviles siempre reciben la
// versión nueva aunque se olvide subir la versión en package.json.

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Lo que se publica. Todo lo demás (tests, scripts, docs) se queda fuera. */
const ENTRIES = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

async function walk(rel) {
  const abs = join(ROOT, rel);
  if (!(await stat(abs)).isDirectory()) return [rel];
  const out = [];
  for (const name of await readdir(abs)) {
    if (name.startsWith('.')) continue;
    out.push(...(await walk(join(rel, name))));
  }
  return out;
}

function replaceOnce(text, token, value, file) {
  if (!text.includes(token)) throw new Error(`${file}: falta el marcador ${token}`);
  return text.replace(token, () => value);
}

/**
 * Construye el sitio en `out`. Devuelve { version, hash, cacheVersion, precache }.
 */
export async function build(out = join(ROOT, '_site')) {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const files = (await Promise.all(ENTRIES.map(walk))).flat()
    .map((f) => f.split(sep).join('/'))
    .sort();

  const h = createHash('sha256');
  h.update(pkg.version);
  for (const f of [...files, 'sw.js']) {
    h.update(`\0${f}\0`);
    h.update(await readFile(join(ROOT, f)));
  }
  const hash = h.digest('hex').slice(0, 8);
  const cacheVersion = `ic-toolbox-${pkg.version}-${hash}`;
  const precache = ['./', ...files.map((f) => `./${f}`)];

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const e of ENTRIES) await cp(join(ROOT, e), join(out, e), { recursive: true });

  let sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
  sw = replaceOnce(sw, "'__CACHE_VERSION__'", JSON.stringify(cacheVersion), 'sw.js');
  sw = replaceOnce(sw, '[/* __PRECACHE__ */]', JSON.stringify(precache, null, 2), 'sw.js');
  await writeFile(join(out, 'sw.js'), sw);

  const appPath = join(out, 'js', 'app.js');
  const app = replaceOnce(await readFile(appPath, 'utf8'), "'__APP_VERSION__'", JSON.stringify(`${pkg.version} · ${hash}`), 'js/app.js');
  await writeFile(appPath, app);

  await writeFile(join(out, '.nojekyll'), '');
  return { version: pkg.version, hash, cacheVersion, precache };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? resolve(process.argv[i + 1]) : join(ROOT, '_site');
  const r = await build(out);
  console.log(`Sitio en ${relative(process.cwd(), out) || '.'}: ${r.cacheVersion}, ${r.precache.length} archivos en precache`);
}
