import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES, ULTIMATE_RULES, CONTROLLERS, ruleTypes, stepLevels, identifySelf, identifyInteg, tune, tuneUltimate,
  defaultLambda, seriesToIdeal, idealToSeries, idealToParallel, robustness, msClass, simulate, actionFor,
} from '../js/pid.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const self = { kind: 'self', K: 2, tau: 60, theta: 10 };
const integ = { kind: 'integ', K: 0.01, theta: 5 };

test('identificación por dos puntos recupera un primer orden con tiempo muerto', () => {
  // Respuesta exacta de K·(1 − e^(−(t−θ)/τ)): t = θ + τ·ln(1/(1 − f)).
  const tau = 40;
  const theta = 8;
  const at = (f) => theta + tau * Math.log(1 / (1 - f));
  const r = identifySelf({
    pv0: 50, pv1: 65, cv0: 30, cv1: 40, pvSpan: 200, cvSpan: 100, t28: at(0.283), t63: at(0.632),
  });
  close(r.K, (15 / 200) / 0.1);
  close(r.tau, tau, 2e-3);
  close(r.theta, theta, 5e-3);
  const r2 = identifySelf({
    pv0: 50, pv1: 65, cv0: 30, cv1: 40, pvSpan: 200, cvSpan: 100, method: 't63', tStart: theta, t63: at(0.632),
  });
  close(r2.tau, tau, 1e-3);
  assert.equal(r2.theta, theta);
  const L = stepLevels(50, 65);
  close(L.p28, 54.245);
  close(L.p63, 59.48);
});

test('identificación: signos, avisos y errores', () => {
  const r = identifySelf({ pv0: 80, pv1: 70, cv0: 50, cv1: 52, pvSpan: 100, cvSpan: 100, t28: 0.5, t63: 3 });
  assert.ok(r.K < 0);
  assert.ok(r.warnings.includes('neg-theta')); // τ = 3,75 → θ = −0,75, se deja en 0
  assert.equal(r.theta, 0);
  assert.ok(r.warnings.includes('small-step'));
  assert.throws(() => identifySelf({ pv0: 1, pv1: 2, cv0: 5, cv1: 5, pvSpan: 1, cvSpan: 1, t28: 1, t63: 2 }));
  assert.throws(() => identifySelf({ pv0: 1, pv1: 2, cv0: 5, cv1: 6, pvSpan: 1, cvSpan: 1, t28: 3, t63: 2 }));
  const i = identifyInteg({ slope0: 0.01, slope1: 0.05, cv0: 40, cv1: 50, pvSpan: 4, cvSpan: 100, tStart: 6 });
  close(i.K, (0.04 / 4) / 0.1);
  assert.equal(i.theta, 6);
});

test('reglas sobre FOPDT: valores de las tablas', () => {
  // Lambda PI con λ = max(τ, 3θ) = 60
  assert.equal(defaultLambda('lambda', self), 60);
  let p = tune('lambda', 'PI', self);
  close(p.Kc, 60 / (2 * 70)); close(p.Ti, 60); assert.equal(p.Td, 0);
  // IMC-PID (Rivera 1986): Kc = (2τ+θ)/(K(2λ+θ)), Ti = τ + θ/2, Td = τθ/(2τ+θ)
  p = tune('lambda', 'PID', self, 20);
  close(p.Kc, 130 / (2 * 50)); close(p.Ti, 65); close(p.Td, 600 / 130);
  // SIMC: τc = θ → Kc = τ/(K·2θ), Ti = min(τ, 8θ)
  p = tune('simc', 'PI', self);
  close(p.Kc, 1.5); close(p.Ti, 60);
  p = tune('simc', 'PI', { kind: 'self', K: 1, tau: 200, theta: 10 });
  close(p.Ti, 80);
  // Ziegler-Nichols (curva de reacción)
  p = tune('zn', 'PID', self);
  close(p.Kc, 1.2 * 60 / 20); close(p.Ti, 20); close(p.Td, 5);
  close(tune('zn', 'PI', self).Ti, 10 / 0.3);
  assert.equal(tune('zn', 'P', self).Ti, Infinity);
  // Cohen-Coon con r = 1/6
  p = tune('cc', 'PI', self);
  close(p.Kc, 3 * (0.9 + 1 / 72)); close(p.Ti, 10 * 30.5 / (9 + 20 / 6));
  p = tune('cc', 'PID', self);
  close(p.Kc, 3 * (4 / 3 + 1 / 24)); close(p.Ti, 10 * 33 / (13 + 8 / 6)); close(p.Td, 40 / (11 + 1 / 3));
  // La ganancia sale siempre positiva: el signo va en la acción
  close(tune('simc', 'PI', { ...self, K: -2 }).Kc, 1.5);
  assert.equal(actionFor(2), 'reverse');
  assert.equal(actionFor(-2), 'direct');
});

test('reglas sobre integrador y casos sin versión', () => {
  let p = tune('lambda', 'PI', integ, 15);
  close(p.Ti, 35); close(p.Kc, 35 / (0.01 * 400));
  p = tune('simc', 'PI', integ);
  close(p.Kc, 10); close(p.Ti, 40);
  p = tune('zn', 'PI', integ);
  close(p.Kc, 0.9 / 0.05);
  assert.equal(tune('cc', 'PI', integ), null);
  assert.equal(tune('lambda', 'PID', integ), null);
  assert.deepEqual(ruleTypes('lambda', 'integ'), ['PI']);
  assert.deepEqual(ruleTypes('cc', 'integ'), []);
  assert.equal(tune('zn', 'PI', { ...self, theta: 0 }), null);
  assert.equal(tune('simc', 'PID', self), null);
  for (const [id, r] of Object.entries(RULES)) {
    for (const t of ruleTypes(id, 'self')) assert.ok(tune(id, t, self), `${id} ${t}`);
    assert.ok(r.label);
  }
});

test('reglas de ciclo sostenido', () => {
  let p = tuneUltimate('zn', 'PID', 5, 40);
  close(p.Kc, 3); close(p.Ti, 20); close(p.Td, 5);
  p = tuneUltimate('tl', 'PI', 3.2, 10);
  close(p.Kc, 1); close(p.Ti, 22);
  assert.equal(tuneUltimate('tl', 'P', 3, 10), null);
  assert.equal(tuneUltimate('zn', 'PI', 0, 10), null);
  assert.ok(ULTIMATE_RULES.zn.types.includes('P'));
});

test('conversión entre formas ideal, serie y paralelo', () => {
  const s = { Kc: 2, Ti: 30, Td: 5 };
  const i = seriesToIdeal(s);
  close(i.Kc, 2 * (1 + 5 / 30)); close(i.Ti, 35); close(i.Td, 150 / 35);
  const back = idealToSeries(i);
  close(back.Kc, 2); close(back.Ti, 30); close(back.Td, 5);
  assert.equal(idealToSeries({ Kc: 1, Ti: 10, Td: 3 }), null); // Ti < 4·Td
  const q = idealToParallel({ Kc: 2, Ti: 40, Td: 6 });
  close(q.Kp, 2); close(q.Ki, 0.05); close(q.Kd, 12);
  assert.equal(idealToParallel({ Kc: 2, Ti: Infinity, Td: 0 }).Ki, 0);
});

test('robustez: coincide con la tabla de Skogestad (2003) para SIMC con τc = θ', () => {
  // FOPDT con τ ≤ 8θ: GM 3,14, PM 61,4°, Ms 1,59. Integrador: GM 2,96, PM 46,9°, Ms 1,70.
  let r = robustness(self, tune('simc', 'PI', self));
  close(r.gm, 3.14, 2e-3); close(r.pm, 61.4, 2e-3); close(r.Ms, 1.59, 4e-3);
  r = robustness(integ, tune('simc', 'PI', integ));
  close(r.gm, 2.96, 2e-3); close(r.pm, 46.9, 2e-3); close(r.Ms, 1.70, 4e-3);
  assert.equal(msClass(r.Ms), 'aggressive');
  assert.equal(msClass(1.3), 'conservative');
  assert.equal(msClass(Infinity), 'unstable');
});

test('robustez: la ganancia última de un FOPDT sale del margen de ganancia con P = 1', () => {
  // Cruce de fase: ωθ + atan(ωτ) = π; Ku = √(1 + (ωτ)²)/K.
  let lo = 0;
  let hi = Math.PI / self.theta;
  for (let i = 0; i < 100; i++) {
    const w = (lo + hi) / 2;
    if (w * self.theta + Math.atan(w * self.tau) < Math.PI) lo = w; else hi = w;
  }
  const Ku = Math.hypot(1, lo * self.tau) / self.K;
  close(robustness(self, { Kc: 1, Ti: Infinity, Td: 0 }).gm, Ku, 1e-3);
  assert.equal(robustness(self, { Kc: 1.05 * Ku, Ti: Infinity, Td: 0 }).stable, false);
});

test('simulación: PI elimina el error y vuelve tras la perturbación', () => {
  for (const m of [self, integ]) {
    const s = simulate(m, tune('simc', 'PI', m));
    const n = s.pv.length;
    close(s.pv[n - 1], 1, 2e-2);
    const iLoad = s.t.findIndex((t) => t >= s.tLoad);
    close(s.pv[iLoad - 1], 1, 2e-2);
    assert.ok(Math.min(...s.pv.slice(iLoad)) < 0.99); // la carga se nota
    assert.ok(s.overshoot < 0.4);
  }
  // Ziegler-Nichols oscila bastante más que Lambda
  assert.ok(simulate(self, tune('zn', 'PI', self)).overshoot > simulate(self, tune('lambda', 'PI', self)).overshoot + 0.3);
});

test('parámetros en las unidades de cada bloque', () => {
  const p = { Kc: 1.5, Ti: 120, Td: 30 };
  const R = { pvSpan: 200, cvSpan: 100 };
  const get = (id) => Object.fromEntries(CONTROLLERS[id].params(p, R).map(([n, v]) => [n, v]));
  let v = get('logix-pid-dep');
  close(v['.KP (Kc)'], 1.5); close(v['.KI (Ti)'], 2); close(v['.KD (Td)'], 0.5);
  v = get('logix-pid-ind');
  close(v['.KI'], 1.5 / 120); close(v['.KD'], 45); // 1/s y s
  v = get('logix-pide-dep');
  close(v['IGain (Ti)'], 2); close(v['DGain (Td)'], 0.5);
  v = get('logix-pide-ind');
  close(v.IGain, 1.5 / 2); close(v.DGain, 0.75); // 1/min y min
  v = get('micro800-pid');
  close(v['Gains.Kc'], 0.75); close(v['Gains.Ti'], 120);
  v = get('m221-pid');
  assert.equal(v['Kp (× 0,01)'], 150); assert.equal(v['Ti (× 0,1 s)'], 1200); assert.equal(v['Td (× 0,1 s)'], 300);
  v = get('m340-pidff');
  close(v['para.kp'], 1.5); close(v['para.ti'], 120);
  v = get('series');
  close(v['Ti′'] + v['Td′'], 120); // Ti = Ti′ + Td′
  // Sin integral: Ti = ∞ → 0 en los bloques donde 0 la anula
  const P = { Kc: 2, Ti: Infinity, Td: 0 };
  assert.equal(CONTROLLERS['logix-pid-dep'].params(P, R)[1][1], 0);
  for (const [id, c] of Object.entries(CONTROLLERS)) {
    assert.ok(c.label && ['cierto', 'probable', 'suposicion'].includes(c.confidence), id);
    if (c.confidence !== 'cierto') assert.ok(c.note, `${id}: falta la advertencia`);
  }
});
