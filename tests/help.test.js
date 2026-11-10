import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../js/tools/registry.js';
import { helpProblems } from '../js/help.js';
import { guide } from '../js/guide.js';

// Falla si se añade una herramienta sin instructivo, o con uno incompleto.
test('cada herramienta tiene su ayuda completa', async () => {
  for (const t of TOOLS) {
    assert.equal(typeof t.help, 'function', `${t.id}: falta help en el registro (js/tools/${t.id}/help.js)`);
    const { help } = await t.help();
    assert.deepEqual(helpProblems(help), [], `${t.id}: ayuda incompleta`);
  }
});

test('helpProblems detecta lo que falta', () => {
  assert.ok(helpProblems(undefined).length);
  assert.ok(helpProblems({}).length >= 4);
  assert.ok(helpProblems({ summary: 'x', inputs: [['a']], example: { title: 't', steps: ['s'], result: 'r' }, limits: ['l'], standards: ['n'] }).length);
});

test('la guía de inicio cubre instalar, sin conexión y reportar', () => {
  const headings = guide.sections.map((s) => s.heading.toLowerCase()).join(' | ');
  for (const w of ['instalar', 'sin conexión', 'reportar']) assert.ok(headings.includes(w), `falta «${w}»`);
  assert.ok(guide.sections.every((s) => s.items.length && s.items.every((i) => i.trim())));
});

// Los números de los ejemplos resueltos salen de los módulos de cálculo: si un cálculo
// cambia, la ayuda no puede quedarse con un ejemplo viejo.
test('los ejemplos resueltos coinciden con el cálculo', async () => {
  const { convert } = await import('../js/units.js');
  const { scale } = await import('../js/signal.js');
  const { rtdResistance, tcTempToMeasured, tcMeasuredToTemp } = await import('../js/temperature.js');
  const { levelRange } = await import('../js/level.js');
  const { calibrationPoint, totalProbableError } = await import('../js/calibration.js');
  const { orificeFlow, flowFromRange } = await import('../js/orifice.js');
  const { tune, defaultLambda } = await import('../js/pid.js');
  const ex = async (id) => (await TOOLS.find((t) => t.id === id).help()).help.example.result;
  const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

  assert.match(await ex('units'), /249,089 mbar/);
  near(convert('pressure', 100, 'inH2O', 'mbar'), 249.089, 5e-4);

  assert.match(await ex('signal'), /Lineal: 5\. Con raíz cuadrada: 7,071/);
  const A = { lo: 4, hi: 20 }; const B = { lo: 0, hi: 10 };
  near(scale(12, A, B).out, 5, 1e-9);
  near(scale(12, A, B, true).out, 7.071, 5e-4);

  assert.match(await ex('temperature'), /138,505 Ω.*16,397 mV.*270,7 °C/);
  near(rtdResistance('pt100', 100), 138.505, 5e-4);
  near(tcTempToMeasured('K', 400, 0), 16.397, 5e-4);
  near(tcMeasuredToTemp('K', 10, 25), 270.7, 0.05);

  const r = await ex('calibration');
  assert.match(r, /media 5,022 bar.*\+0,22 % span.*U = 0,0106 bar \(k = 2,37\).*±0,125 % span.*±0,209 % span.*2,5:1/);
  const p = calibrationPoint({ readings: [5.02, 5.03, 5.01, 5.02, 5.03], ref: 5, lo: 0, hi: 10, uStd: 0.005, tol: 0.5 });
  assert.equal(p.verdict, 'pass');
  near(p.mean, 5.022, 1e-9); near(p.U, 0.0106, 5e-5); near(p.k, 2.37, 5e-3);
  const t = totalProbableError([
    { name: 'a', terms: [{ value: 0.065, base: 'span' }] },
    { name: 't', terms: [{ value: 0.0125, base: 'url' }, { value: 0.0625, base: 'span' }] },
    { name: 's', terms: [{ value: 0.1, base: 'url' }], factor: 1 / 5 },
  ], { lo: 0, hi: 10, url: 25, reading: 10 });
  near(t.rssSpan, 0.125, 5e-4); near(t.worstSpan, 0.209, 5e-4); near(t.turndown, 2.5, 1e-9);

  assert.match(await ex('level'), /−166,713 mbar.*−34,3233 mbar.*132,39 mbar/);
  const wet = levelRange({ config: 'wet', lo: 0, hi: 1.5, tap: 0, rho: 900, taps: 1.7, rhoRef: 1000 });
  near(wet.lrv / 100, -166.713, 5e-4); near(wet.urv / 100, -34.3233, 5e-4); near(wet.span / 100, 132.39, 5e-3);

  assert.match(await ex('orifice'), /β = 0,600, C ≈ 0,609, Re_D ≈ 166 000, Q ≈ 47,05 m³\/h.*63,2 m³\/h/);
  const o = orificeFlow({ D: 0.1, d: 0.06, dp: 25000, rho: 998.2, mu: 0.001, taps: 'flange' });
  near(o.C, 0.609, 5e-4); near(o.qv * 3600, 47.05, 5e-3); near(o.ReD, 166000, 500);
  near(flowFromRange({ qmax: 100, dpmax: 250, dp: 100, rhoDesign: 1000, rhoActual: 1000 }).q, 63.2, 0.05);

  assert.match(await ex('pid'), /Kc = 1,5, Ti = 45 s/);
  const m = { kind: 'self', K: 1.5, tau: 45, theta: 10 };
  const c = tune('simc', 'PI', m, defaultLambda('simc', m));
  near(c.Kc, 1.5, 1e-9); near(c.Ti, 45, 1e-9);
});
