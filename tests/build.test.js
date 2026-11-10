// Comprueba que el sitio publicado funciona offline: todo lo que la app carga está
// en la lista de precache del service worker y no quedan marcadores sin rellenar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { build, ROOT } from '../scripts/build.mjs';

const out = await mkdtemp(join(tmpdir(), 'ict-build-'));
const result = await build(out);
const sw = await readFile(join(out, 'sw.js'), 'utf8');
const precache = new Set(result.precache);

test.after(() => rm(out, { recursive: true, force: true }));

test('sw.js lleva versión y lista rellenas', async () => {
  assert.doesNotMatch(sw, /__[A-Z_]+__/);
  const m = sw.match(/const PRECACHE = (\[[\s\S]*?\]);/);
  assert.ok(m, 'no se encuentra PRECACHE');
  assert.deepEqual(JSON.parse(m[1]), result.precache);
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  assert.match(result.cacheVersion, new RegExp(`^ic-toolbox-${pkg.version.replaceAll('.', '\\.')}-[0-9a-f]{8}$`));
  assert.ok(sw.includes(JSON.stringify(result.cacheVersion)));
});

test('la versión del pie se rellena', async () => {
  const app = await readFile(join(out, 'js', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /__APP_VERSION__/);
  assert.ok(app.includes(`${result.version} · ${result.hash}`));
});

test('cada módulo importado está en precache', async () => {
  const jsFiles = (await readdir(join(out, 'js'), { recursive: true })).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0);
  const importRe = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  for (const f of jsFiles) {
    const src = await readFile(join(out, 'js', f), 'utf8');
    for (const [, spec] of src.matchAll(importRe)) {
      const target = `./${posix.normalize(posix.join('js', posix.dirname(f.replaceAll('\\', '/')), spec))}`;
      assert.ok(precache.has(target), `js/${f} importa ${spec}, que no está en precache`);
    }
  }
});

test('todo lo que referencian index.html y el manifest está en precache', async () => {
  const html = await readFile(join(out, 'index.html'), 'utf8');
  for (const [, url] of html.matchAll(/\b(?:href|src)="([^"#:]+)"/g)) {
    assert.ok(precache.has(`./${url}`), `index.html referencia ${url}, que no está en precache`);
  }
  const manifest = JSON.parse(await readFile(join(out, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) assert.ok(precache.has(`./${icon.src}`), `falta ${icon.src}`);
});

test('no se publica nada fuera de la app', () => {
  for (const p of precache) assert.doesNotMatch(p, /^\.\/(tests|scripts|node_modules|\.github)\//);
});
