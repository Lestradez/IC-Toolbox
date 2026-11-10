import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIQUIDS, GASES, STEAM, liquidById, liquidRange, liquidProps, mercuryDensity,
  petroleumDensity, petroleumDensityAt15, refinedGroup, rho15FromApi, apiFromRho15, sgFromApi,
  gasProps, prSaturationPressure, gasById, steamSaturated, liquidAt, liquidChoices, needsRho15,
} from '../js/densities.js';

// Valores de referencia generados con CoolProp (scripts/densities_reference.py) en puntos
// que NO están en la rejilla de 5 °C, para validar también la interpolación.
const REF = JSON.parse(readFileSync(new URL('./fixtures/densities-reference.json', import.meta.url)));
const rel = (a, b) => Math.abs(a / b - 1);

test('datos: ids únicos, tablas completas y fuente citada', () => {
  assert.equal(new Set(LIQUIDS.map((l) => l.id)).size, LIQUIDS.length);
  for (const l of LIQUIDS) {
    assert.ok(l.source.includes('CoolProp'), l.id);
    assert.ok(l.rho.length >= 5, l.id);
    if (l.mu) assert.equal(l.mu.length, l.rho.length, l.id);
    // un líquido se dilata al calentarse (la tabla del agua empieza por encima de 4 °C)
    for (let i = 1; i < l.rho.length; i++) assert.ok(l.rho[i] < l.rho[i - 1], `${l.id} no decrece en ${l.t0 + i * l.step} °C`);
    // y se vuelve menos viscoso
    if (l.mu) for (let i = 1; i < l.mu.length; i++) assert.ok(l.mu[i] < l.mu[i - 1], `${l.id} μ no decrece`);
  }
  assert.equal(new Set(GASES.map((g) => g.id)).size, GASES.length);
});

test('líquidos: coinciden con CoolProp dentro y entre los puntos de la tabla', () => {
  assert.ok(REF.liquids.length > 30 && REF.glycols.length > 20);
  for (const r of [...REF.liquids, ...REF.glycols]) {
    const o = liquidProps(r.id, r.t);
    // 0,1 % en densidad (el CO₂ saturado cerca de su punto crítico es el peor caso: 0,06 %)
    assert.ok(rel(o.rho, r.rho) < 1e-3, `${r.id} ${r.t} °C: ${o.rho} vs ${r.rho}`);
    if (r.mu === null) assert.equal(o.mu, null);
    else assert.ok(rel(o.mu, r.mu) < 5e-3, `${r.id} ${r.t} °C μ: ${o.mu} vs ${r.mu}`);
  }
});

test('líquidos: valores conocidos de agua y etanol', () => {
  const w = liquidProps('water', 20);
  assert.ok(Math.abs(w.rho - 998.2) < 0.1, `agua 20 °C: ${w.rho}`);
  assert.ok(Math.abs(w.mu - 1.002) < 0.003, `agua 20 °C μ: ${w.mu}`);
  assert.ok(Math.abs(liquidProps('water', 90).rho - 965.3) < 0.1);
  assert.ok(Math.abs(liquidProps('ethanol', 20).rho - 789.4) < 0.3);
  assert.ok(Math.abs(liquidProps('propane', 15).rho - 508.5) < 1.5, 'propano saturado a 15 °C');
  assert.equal(liquidProps('acetone', 20).mu, null, 'sin viscosidad fiable no se inventa una');
});

test('líquidos: fuera de la tabla no se extrapola', () => {
  assert.throws(() => liquidProps('water', 99), RangeError);
  assert.throws(() => liquidProps('water', 2), RangeError);
  assert.throws(() => liquidProps('water', NaN), RangeError);
  assert.throws(() => liquidProps('nada', 20), /desconocido/);
  assert.deepEqual(liquidRange(liquidById('propane')), [-40, 60]);
  // los extremos exactos sí valen
  assert.ok(liquidProps('water', 5).rho > 999.9);
  assert.ok(liquidProps('water', 95).rho < 962);
});

test('mezclas agua-glicol: más concentradas, más densas y más viscosas', () => {
  const rho = (id) => liquidProps(id, 20).rho;
  assert.ok(rho('meg20') < rho('meg30') && rho('meg30') < rho('meg40') && rho('meg40') < rho('meg50'));
  assert.ok(rho('mpg20') < rho('mpg50'));
  assert.ok(liquidProps('mpg50', 20).mu > liquidProps('meg50', 20).mu);
  assert.ok(rho('meg30') > 1030 && rho('meg30') < 1045);
});

test('mercurio: 13 595,08 a 0 °C y 13 545,8 a 20 °C', () => {
  assert.equal(mercuryDensity(0), 13595.08);
  assert.ok(Math.abs(mercuryDensity(20) - 13545.8) < 0.2);
  assert.throws(() => mercuryDensity(150), RangeError);
});

test('petróleo: ρ15 a 15 °C, dilatación coherente y sentido inverso', () => {
  assert.ok(Math.abs(petroleumDensity('crude', 850, 15).rho - 850) < 1e-9);
  // un crudo de 850 kg/m³ pierde unos 0,7 kg/m³ por cada °C
  const d = petroleumDensity('crude', 850, 25).rho - 850;
  assert.ok(d < -6.5 && d > -8, `Δρ para 10 °C: ${d}`);
  assert.ok(petroleumDensity('crude', 850, 60).rho < petroleumDensity('crude', 850, 30).rho);
  assert.ok(petroleumDensity('crude', 850, 0).rho > 850);
  // más ligero se dilata más: la gasolina más que el gasóleo
  const drop = (g, r) => 1 - petroleumDensity(g, r, 40).rho / r;
  assert.ok(drop('refined', 740) > drop('refined', 850) * 1.3);
  for (const [g, r, t] of [['crude', 850, 60], ['refined', 740, 30], ['refined', 845, 5], ['refined', 800, 50]]) {
    const at = petroleumDensity(g, r, t).rho;
    assert.ok(Math.abs(petroleumDensityAt15(g, at, t) - r) < 1e-6, `${g} ${r}`);
  }
});

test('petróleo: grupos de producto refinado y rangos', () => {
  assert.equal(refinedGroup(740), 'gasoline');
  assert.equal(refinedGroup(780), 'transition');
  assert.equal(refinedGroup(800), 'jet');
  assert.equal(refinedGroup(845), 'fuel');
  assert.equal(petroleumDensity('refined', 800, 20).group, 'jet');
  assert.throws(() => petroleumDensity('crude', 500, 20), RangeError);
  assert.throws(() => petroleumDensity('refined', 1300, 20), RangeError);
  assert.throws(() => petroleumDensity('crude', 850, 200), RangeError);
  // continuidad en el empalme gasolina → transición → jet (saltos de décimas, no de kg/m³)
  const at = (r) => petroleumDensity('refined', r, 50).rho / r;
  assert.ok(Math.abs(at(769.9) - at(770.1)) < 0.003);
  assert.ok(Math.abs(at(787.4) - at(787.6)) < 0.003);
});

test('°API: definición y ida y vuelta', () => {
  assert.ok(Math.abs(sgFromApi(10) - 1) < 1e-3 * 0 + 1e-12);
  assert.ok(Math.abs(sgFromApi(35) * 999.016 - 849.0) < 0.05);
  for (const api of [20, 35, 45]) assert.ok(Math.abs(apiFromRho15(rho15FromApi(api)) - api) < 1e-9);
  // 35 °API a 15 °C está unos 0,4 kg/m³ por encima de la densidad a 60 °F
  const r15 = rho15FromApi(35);
  assert.ok(r15 > 849.2 && r15 < 849.7, `${r15}`);
});

test('gases: Peng-Robinson contra CoolProp (≈1 % hasta 10 bar, ≈3 % a 40 bar)', () => {
  let n = 0;
  for (const r of REF.gases) {
    if (r.psat) continue;
    const o = gasProps(r.id, r.T, r.p);
    if (o.condensing) continue; // cerca de la saturación el modelo no se declara válido
    n += 1;
    const tol = r.p <= 10.1e5 ? 0.012 : 0.03;
    assert.ok(rel(o.rho, r.rho) < tol, `${r.id} ${r.T} K ${r.p / 1e5} bar: ${o.rho} vs ${r.rho}`);
    assert.ok(rel(o.Z, r.Z) < tol, `${r.id} Z`);
  }
  assert.ok(n > 80, `solo ${n} casos comprobados`);
});

test('gases: aire a 15 °C y 1 atm da 1,225 kg/m³; límite de gas ideal', () => {
  const a = gasProps('air', 288.15, 101325);
  assert.ok(Math.abs(a.rho - 1.225) < 0.003, `${a.rho}`);
  assert.ok(Math.abs(a.Z - 1) < 1e-3);
  assert.ok(Math.abs(a.M - 28.9655) < 0.001);
  assert.ok(Math.abs(gasProps('hydrogen', 273.15, 101325).rho - 0.0899) < 0.0005);
});

test('gases: aviso de condensación y presión de saturación', () => {
  assert.equal(gasProps('propane', 298.15, 5e5).condensing, false);
  assert.equal(gasProps('propane', 298.15, 10e5).condensing, true); // psat ≈ 9,5 bar
  assert.equal(gasProps('methane', 298.15, 50e5).condensing, false); // T > Tc
  assert.ok(Number.isNaN(prSaturationPressure(gasById('methane'), 300)));
  for (const r of REF.gases) {
    if (!r.psat) continue;
    for (const [t, p] of r.psat) assert.ok(rel(prSaturationPressure(gasById(r.id), t), p) < 0.015, `${r.id} ${t} K`);
  }
  assert.throws(() => gasProps('air', 300, 0), RangeError);
  assert.throws(() => gasProps('nada', 300, 1e5), /desconocido/);
});

test('vapor saturado: coincide con IAPWS-95 y con la tabla conocida', () => {
  for (const r of REF.steam) {
    const o = steamSaturated(r.p);
    assert.ok(Math.abs(o.T - r.T) < 0.02, `T a ${r.p} bar`);
    assert.ok(rel(o.rhoV, r.rhoV) < 5e-4, `ρv a ${r.p} bar: ${o.rhoV} vs ${r.rhoV}`);
    assert.ok(rel(o.rhoL, r.rhoL) < 1e-4);
  }
  const one = steamSaturated(1);
  assert.ok(Math.abs(one.T - 99.61) < 0.02 && Math.abs(one.rhoV - 0.5904) < 0.001);
  assert.throws(() => steamSaturated(0.1), RangeError);
  assert.throws(() => steamSaturated(300), RangeError);
  assert.ok(STEAM.source.includes('CoolProp'));
});

test('liquidAt: una sola entrada para líquidos, petróleo y mercurio', () => {
  assert.ok(Math.abs(liquidAt('water', 20).rho - 998.2) < 0.1);
  assert.ok(Math.abs(liquidAt('crude', 40, 850).rho - petroleumDensity('crude', 850, 40).rho) < 1e-12);
  assert.equal(liquidAt('refined', 20, 800).group, 'jet');
  assert.equal(liquidAt('crude', 20, 850).mu, null);
  assert.ok(liquidAt('mercury', 20).source.includes('13 595'));
  assert.throws(() => liquidAt('crude', 20), RangeError);
  assert.throws(() => liquidAt('crude', 20, NaN), RangeError);
  assert.throws(() => liquidAt('nada', 20), /desconocido/);
  const groups = liquidChoices();
  const values = groups.flatMap((g) => g.items.map((i) => i.value));
  assert.equal(new Set(values).size, values.length);
  for (const v of ['water', 'meg30', 'mpg30', 'propane', 'crude', 'refined', 'mercury']) assert.ok(values.includes(v), v);
  assert.equal(groups[0].label, 'Agua');
  assert.ok(needsRho15('crude') && !needsRho15('water'));
});
