import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { xlsx, zip, crc32, colName } from '../js/xlsx.js';

const enc = new TextEncoder();

test('CRC-32 y nombres de columna', () => {
  assert.equal(crc32(enc.encode('123456789')), 0xCBF43926); // valor de control del estándar
  assert.equal(crc32(new Uint8Array()), 0);
  assert.deepEqual([0, 25, 26, 51, 701, 702].map(colName), ['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
});

test('ZIP: cabeceras y directorio central', () => {
  const z = zip({ 'a.txt': 'hola', 'ñ/b.xml': '<x/>' });
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const end = z.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), 2);
  const cdOffset = dv.getUint32(end + 16, true);
  assert.equal(dv.getUint32(cdOffset, true), 0x02014b50);
  assert.equal(dv.getUint32(cdOffset + 16, true), crc32(enc.encode('hola')));
});

test('xlsx: texto escapado, números y estilos', () => {
  const bytes = xlsx([{ name: 'Hoja: [1]', rows: [[{ v: 'A & <B>', s: 'title' }, 1.5], [], [null, { v: 'ñ', s: 'ok' }, NaN]], widths: [20] }]);
  const s = new TextDecoder().decode(bytes);
  assert.match(s, /<sheet name="Hoja   1" sheetId="1"/);
  assert.match(s, /A &amp; &lt;B&gt;/);
  assert.match(s, /<c r="B1"><v>1.5<\/v><\/c>/);
  assert.match(s, /<c r="B3" s="4" t="inlineStr"><is><t xml:space="preserve">ñ<\/t>/);
  assert.match(s, /<c r="C3" t="inlineStr"><is><t>—<\/t>/);
  assert.doesNotMatch(s, /<row r="2">/);
  assert.match(s, /<col min="1" max="1" width="20" customWidth="1"\/>/);
  assert.doesNotMatch(s, /name="[^"]*[[\]:]/);
});

// Si hay Python con openpyxl (como en el entorno de desarrollo), abre el archivo de verdad.
test('xlsx: lo abre openpyxl', (t) => {
  try { execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' }); } catch { t.skip('sin python3/openpyxl'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
  try {
    const f = join(dir, 'a.xlsx');
    writeFileSync(f, xlsx([{ name: 'Datos', rows: [['Texto', 2.25], [{ v: 'Cumple', s: 'ok' }, { v: 0.125, s: 'num3' }]] }]));
    const out = execFileSync('python3', ['-c', `
import openpyxl, sys
ws = openpyxl.load_workbook(sys.argv[1]).active
print(ws.title, ws['A1'].value, ws['B1'].value, ws['A2'].value, ws['B2'].value, ws['B2'].number_format, ws['A2'].font.b)
`, f]).toString().trim();
    assert.equal(out, 'Datos Texto 2.25 Cumple 0.125 0.000 True');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
