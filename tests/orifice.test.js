import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dischargeCoefficient, expansibility, permanentLoss, gasDensity, mixtureDensity,
  orificeFlow, sizeOrifice, minReynolds, uncertaintyC, uncertaintyEps, validityChecks, flowFromRange,
} from '../js/orifice.js';

const close = (actual, expected, relTol = 1e-9) => {
  const tol = Math.max(Math.abs(expected) * relTol, 1e-15);
  assert.ok(Math.abs(actual - expected) <= tol, `esperado ${expected}, obtenido ${actual}`);
};

// Casos de referencia calculados con la librería independiente `fluids` 1.3.1 (Caleb Bell,
// MIT; implementa ISO 5167-2:2003): C_Reader_Harris_Gallagher, orifice_expansibility,
// differential_pressure_meter_solver y dP_orifice. Para líquidos se resolvió qm con ε = 1.
// Cubre las tres tomas, β de 0,20 a 0,72, D < 71,12 mm, Re bajo (15 cP) y gases.
// El script que los genera está en scripts/orifice_reference.py.
const REF = [
  // Ejemplo del HTML original: 3" Sch 40, d = 40 mm, 250 mbar, BSW 60 %, 15 cP
  { D: 0.07793, d: 0.04, dp: 25000, rho: 970, mu: 0.015, taps: 'flange', qm: 5.66897429367, C: 0.62488913591, eps: 1, loss: 17799.8360497 },
  { D: 0.10226, d: 0.0511, dp: 20000, rho: 998.2, mu: 0.001002, taps: 'corner', qm: 8.12129935891, C: 0.606840616094, eps: 1, loss: 14643.795981 },
  { D: 0.2027, d: 0.1418, dp: 50000, rho: 998.2, mu: 0.001002, taps: 'dd2', qm: 110.4096837, C: 0.610250443527, eps: 1, loss: 25529.7166065 },
  { D: 0.0525, d: 0.03, dp: 10000, rho: 1000, mu: 0.001, taps: 'flange', qm: 2.05265262998, C: 0.613741710832, eps: 1, loss: 6564.29407347 },
  { D: 0.3048, d: 0.061, dp: 6000, rho: 800, mu: 0.002, taps: 'corner', qm: 5.44924116133, C: 0.601315269769, eps: 1, loss: 5717.6454207 },
  { D: 0.1541, d: 0.11, dp: 30000, rho: 39.55029357, mu: 1.1e-05, taps: 'flange', p1: 5e+06, kappa: 1.3, qm: 10.1958743298, C: 0.600601478923, eps: 0.997782353572, loss: 14940.369701 },
  { D: 0.07391, d: 0.0222, dp: 1000, rho: 1.165, mu: 1.85e-05, taps: 'flange', p1: 100000, kappa: 1.4, qm: 0.0113061648551, C: 0.6041785018, eps: 0.997473914281, loss: 896.363757139 },
  { D: 0.2545, d: 0.1527, dp: 60000, rho: 9.492070456, mu: 1.2e-05, taps: 'dd2', p1: 1.2e+06, kappa: 1.31, qm: 12.4895786284, C: 0.605462176831, eps: 0.984648343376, loss: 37759.3311075 },
];

const inputs = (c) => {
  const o = { D: c.D, d: c.d, dp: c.dp, rho: c.rho, mu: c.mu, taps: c.taps };
  if (c.kappa) Object.assign(o, { p1: c.p1, kappa: c.kappa });
  return o;
};

test('caudal: coincide con la referencia independiente (fluids)', () => {
  for (const c of REF) {
    const r = orificeFlow(inputs(c));
    assert.ok(r.converged, `no convergió en ${c.taps} D=${c.D}`);
    close(r.qm, c.qm);
    close(r.C, c.C);
    close(r.eps, c.eps);
    close(r.loss, c.loss);
  }
});

test('C: ejemplo publicado en la documentación de fluids', () => {
  // C_Reader_Harris_Gallagher(D=0.07391, Do=0.0222, rho=1.165, mu=1.85E-5, m=0.12, taps='flange')
  const ReD = (4 * 0.12) / (Math.PI * 1.85e-5 * 0.07391);
  close(dischargeCoefficient(0.0222 / 0.07391, ReD, 73.91, 'flange'), 0.5990326277163659);
});

test('C: término de tubería pequeña solo para D < 71,12 mm', () => {
  const big = dischargeCoefficient(0.5, 1e6, 71.12, 'corner');
  const small = dischargeCoefficient(0.5, 1e6, 71.11, 'corner');
  close(small - big, 0.011 * 0.25 * (2.8 - 71.11 / 25.4), 1e-6);
});

test('C: tomas en esquina no dependen de D (sin término de tubería pequeña)', () => {
  close(dischargeCoefficient(0.6, 2e5, 100, 'corner'), dischargeCoefficient(0.6, 2e5, 800, 'corner'), 1e-15);
});

test('dimensionamiento: invierte el cálculo directo', () => {
  for (const c of REF) {
    const s = sizeOrifice({ ...inputs(c), qm: c.qm });
    close(s.d, c.d, 1e-10);
    close(s.C, c.C, 1e-9);
    close(s.eps, c.eps, 1e-9);
  }
});

test('dimensionamiento: error claro si β sale de rango', () => {
  const base = { D: 0.1, dp: 25000, rho: 1000, mu: 1e-3, taps: 'flange' };
  assert.throws(() => sizeOrifice({ ...base, qm: 1e-5 }), /demasiado bajo/);
  assert.throws(() => sizeOrifice({ ...base, qm: 500 }), /demasiado alto/);
});

test('líquido: ε = 1 cuando no se dan p1 ni κ', () => {
  assert.equal(orificeFlow({ D: 0.1, d: 0.05, dp: 1e4, rho: 1000, mu: 1e-3, taps: 'corner' }).eps, 1);
});

test('C fijo: no itera y lo respeta', () => {
  const r = orificeFlow({ D: 0.1, d: 0.05, dp: 1e4, rho: 1000, mu: 1e-3, taps: 'corner', C: 0.605 });
  assert.equal(r.C, 0.605);
  close(r.qm, 0.605 / Math.sqrt(1 - 0.5 ** 4) * Math.PI / 4 * 0.05 ** 2 * Math.sqrt(2 * 1e4 * 1000), 1e-14);
});

test('entradas imposibles lanzan error', () => {
  const ok = { D: 0.1, d: 0.05, dp: 1e4, rho: 1000, mu: 1e-3, taps: 'corner' };
  assert.throws(() => orificeFlow({ ...ok, d: 0.1 }), /menor que D/);
  assert.throws(() => orificeFlow({ ...ok, dp: 0 }), /dp/);
  assert.throws(() => orificeFlow({ ...ok, mu: NaN }), /mu/);
  assert.throws(() => orificeFlow({ ...ok, taps: 'xx' }), /tomas/);
  assert.throws(() => expansibility(0.5, 2e5, 1e5, 1.4), /mayor que p1/);
});

test('ε y pérdida permanente: casos límite', () => {
  assert.equal(expansibility(0.5, 0, 1e5, 1.4), 1);
  // Para β → 0 la pérdida permanente tiende al 100 % del ΔP
  close(permanentLoss(1e-4, 0.6, 1000), 1000, 1e-6);
});

test('densidades', () => {
  // Aire seco a 0 °C y 1 atm: 1,2922 kg/m³
  close(gasDensity(101325, 273.15, 0.0289647), 1.29228, 1e-4);
  close(gasDensity(5e6, 298.15, 0.01804, 0.92), 39.55029357, 1e-9);
  close(mixtureDensity(0.6, 850, 1050), 970, 1e-15);
});

test('límites de validez ISO 5167-2 5.3.1', () => {
  close(minReynolds(0.5, 100, 'corner'), 5000);
  close(minReynolds(0.7, 100, 'dd2'), 16000 * 0.49);
  close(minReynolds(0.7, 500, 'flange'), 170 * 0.49 * 500);
  close(minReynolds(0.3, 100, 'flange'), 5000);

  assert.deepEqual(validityChecks({ D: 0.1, d: 0.05, ReD: 1e5, taps: 'corner', dp: 1e4 }), []);
  const bad = validityChecks({ D: 0.04, d: 0.01, ReD: 3000, taps: 'corner', dp: 3e4, p1: 1e5 });
  const texts = bad.map((m) => m.text).join('\n');
  assert.match(texts, /12,5 mm/);
  assert.match(texts, /50–1000 mm/);
  assert.match(texts, /Re_D/);
  assert.match(texts, /p2\/p1/);
  // Con C fijo no se avisa del Re mínimo
  assert.ok(!validityChecks({ D: 0.1, d: 0.05, ReD: 100, taps: 'corner', dp: 1, Cfixed: true }).length);
});

test('incertidumbre de C y ε (ISO 5167-2 5.3.3)', () => {
  close(uncertaintyC(0.15, 100, 1e6), 0.55);
  close(uncertaintyC(0.4, 100, 1e6), 0.5);
  close(uncertaintyC(0.7, 100, 1e6), 1.667 * 0.7 - 0.5);
  close(uncertaintyC(0.7, 100, 5000), 1.667 * 0.7 - 0.5 + 0.2);
  close(uncertaintyC(0.5, 52.5, 1e6), 0.5 + 0.9 * 0.25 * (2.8 - 52.5 / 25.4));
  assert.ok(Number.isNaN(uncertaintyC(0.8, 100, 1e6)));
  close(uncertaintyEps(1e4, 1e6, 1.4), 0.025);
});

test('caudal desde rango (Qmax a ΔPmax)', () => {
  const r = flowFromRange({ qmax: 300, dpmax: 500, dp: 125, rhoDesign: 1000, rhoActual: 970, cutoff: 0.05 });
  close(r.frac, 0.5);
  close(r.dpFrac, 0.25);
  close(r.K, Math.sqrt(1000 / 970));
  close(r.q, 150 * Math.sqrt(1000 / 970));
  const low = flowFromRange({ qmax: 300, dpmax: 500, dp: 0.5, rhoDesign: 1000, rhoActual: 1000, cutoff: 0.05 });
  assert.equal(low.cut, true);
  assert.equal(low.q, 0);
});

test('tuberías ASME B36.10M', async () => {
  const { PIPES, pipeID, matchSchedule } = await import('../js/pipes.js');
  close(pipeID('3"', '40 / STD').id, 77.92, 1e-12);
  close(pipeID('4"', '80 / XS').id, 97.18, 1e-12);
  close(pipeID('12"', 'STD').id, 304.79, 1e-12);
  assert.equal(matchSchedule('12"', '40 / STD'), '40');
  assert.equal(matchSchedule('3"', '40'), '40 / STD');
  assert.equal(matchSchedule('2"', '30'), '40 / STD');
  for (const [nps, p] of Object.entries(PIPES)) {
    for (const [sch, t] of p.w) assert.ok(t > 0 && p.od - 2 * t > 0, `${nps} ${sch}`);
  }
});
