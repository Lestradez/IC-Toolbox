import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, CATEGORIES, toolById, searchTools } from '../js/tools/registry.js';

test('ids únicos, categorías conocidas y vistas montables', async () => {
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
  for (const t of TOOLS) {
    assert.match(t.id, /^[a-z0-9-]+$/);
    assert.ok(CATEGORIES.includes(t.category), `${t.id}: categoría ${t.category}`);
    assert.ok(t.title && t.desc, t.id);
    const mod = await t.load();
    assert.equal(typeof mod.mount, 'function', `${t.id} no exporta mount()`);
  }
  assert.equal(toolById('orifice').title, 'Placa orificio');
  assert.equal(toolById('nada'), undefined);
});

test('búsqueda sin acentos ni mayúsculas y con varias palabras', () => {
  const ids = (q) => searchTools(q).map((t) => t.id);
  assert.deepEqual(ids(''), TOOLS.map((t) => t.id));
  assert.deepEqual(ids('SENAL'), ['signal']);
  assert.deepEqual(ids('raiz'), ['signal']);
  assert.deepEqual(ids('caudal placa'), ['orifice']);
  assert.deepEqual(ids('psi'), ['units', 'signal']);
  assert.deepEqual(ids('0-10v'), ['signal']);
  assert.deepEqual(ids('kpa'), ['units']);
  assert.deepEqual(ids('pt100'), ['temperature']);
  assert.deepEqual(ids('termocupla junta fria'), ['temperature']);
  assert.deepEqual(ids('xyz'), []);
});
