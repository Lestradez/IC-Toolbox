// RTD y termopares contra las tablas de referencia publicadas:
//   - termopares: tablas ITS-90 de NIST SRD 60 / IEC 60584-1 (mV con 3 decimales);
//   - Pt100: tabla de IEC 60751 (Ω con 2 decimales);
//   - Ni120: tabla de Minco (TCR 0,00672) cada 1 °C, en puntos que NO son nodos de la interpolación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RTD_TYPES, TC_TYPES, rtdResistance, rtdTemperature, rtdSensitivity,
  tcEmf, tcTemperature, tcSeebeck, tcMeasuredToTemp, tcTempToMeasured,
} from '../js/temperature.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} (±${tol})`);

// [°C, mV] de las tablas NIST (junta de referencia a 0 °C).
const TC_TABLE = {
  B: [[100, 0.033], [250, 0.291], [500, 1.242], [1000, 4.834], [1820, 13.820]],
  E: [[-270, -9.835], [-200, -8.825], [100, 6.319], [500, 37.005], [1000, 76.373]],
  J: [[-210, -8.095], [-200, -7.890], [100, 5.269], [200, 10.779], [500, 27.393], [760, 42.919],
    [1000, 57.953], [1200, 69.553]],
  K: [[-270, -6.458], [-200, -5.891], [-100, -3.554], [100, 4.096], [200, 8.138], [500, 20.644],
    [1000, 41.276], [1372, 54.886]],
  N: [[-270, -4.345], [-200, -3.990], [100, 2.774], [500, 16.748], [1000, 36.256], [1300, 47.513]],
  R: [[-50, -0.226], [100, 0.647], [500, 4.471], [1000, 10.506], [1500, 17.451]],
  S: [[-50, -0.236], [100, 0.646], [500, 4.233], [1000, 9.587]],
  T: [[-270, -6.258], [-200, -5.603], [-100, -3.379], [100, 4.279], [200, 9.288], [400, 20.872]],
};

test('termopares: f.e.m. igual a las tablas NIST (±0,0005 mV)', () => {
  for (const [type, rows] of Object.entries(TC_TABLE)) {
    for (const [t, mV] of rows) near(tcEmf(type, t), mV, 0.0005, `${type} a ${t} °C`);
    assert.equal(tcEmf(type, 0), type === 'K' ? tcEmf('K', 0) : 0);
  }
  near(tcEmf('K', 0), 0, 1e-12, 'K a 0 °C');
});

test('termopares: inverso desde la tabla dentro de media cifra de la tabla', () => {
  for (const [type, rows] of Object.entries(TC_TABLE)) {
    for (const [t, mV] of rows) {
      // En los extremos el redondeo de la tabla puede caer fuera del rango (S a −50 °C:
      // −0,23556 → −0,236). Esos puntos ya se comprueban en sentido directo.
      if (t <= TC_TYPES[type].invMin || t >= TC_TYPES[type].tmax) continue;
      // ±0,0005 mV de redondeo de la tabla equivalen a ±0,0005 / S °C.
      const tol = 0.0005 / (tcSeebeck(type, t) / 1000) + 1e-6;
      near(tcTemperature(type, mV), t, tol, `${type} con ${mV} mV`);
    }
  }
});

test('termopares: ida y vuelta exacta en todo el rango invertible', () => {
  for (const [type, s] of Object.entries(TC_TYPES)) {
    for (let t = s.invMin; t <= s.tmax; t += 7.3) {
      near(tcTemperature(type, tcEmf(type, t)), t, 1e-6, `${type} a ${t} °C`);
    }
    near(tcTemperature(type, tcEmf(type, s.tmax)), s.tmax, 1e-6, `${type} en tmax`);
  }
});

test('termopares: fuera de rango devuelve NaN', () => {
  assert.ok(Number.isNaN(tcEmf('K', 1400)));
  assert.ok(Number.isNaN(tcEmf('T', 401)));
  assert.ok(Number.isNaN(tcEmf('B', -1)));
  assert.ok(Number.isNaN(tcTemperature('K', 60)));
  assert.ok(Number.isNaN(tcTemperature('K', -7)));
  assert.ok(Number.isNaN(tcTemperature('B', 0))); // B no es invertible cerca de 0 °C
  assert.ok(Number.isNaN(tcEmf('X', 100)));
});

test('termopares: compensación de junta fría', () => {
  // Tipo K, proceso a 100 °C, bornes a 25 °C: el voltímetro ve 4,096 − 1,000 = 3,096 mV.
  near(tcEmf('K', 25), 1.000, 0.0005, 'K a 25 °C');
  near(tcTempToMeasured('K', 100, 25), 3.096, 0.001, 'mV en bornes');
  near(tcMeasuredToTemp('K', 3.096, 25), 100, 0.03, 'T desde mV en bornes');
  // Ida y vuelta, incluida junta fría bajo cero y proceso por debajo de la junta fría.
  for (const [type, t, tcj] of [['J', 350, 30], ['T', -150, -10], ['N', 20, 40], ['S', 1200, 23]]) {
    near(tcMeasuredToTemp(type, tcTempToMeasured(type, t, tcj), tcj), t, 1e-6, `${type} ${t}/${tcj}`);
  }
  // Seebeck del K a 0 °C ≈ 39,45 µV/°C (c1 de NIST + derivada del término exponencial).
  near(tcSeebeck('K', 0), 39.45, 0.01, 'Seebeck K');
});

// IEC 60751, tabla del Pt100.
const PT100 = [[-200, 18.52], [-100, 60.26], [-50, 80.31], [0, 100], [100, 138.51], [200, 175.86],
  [300, 212.05], [400, 247.09], [500, 280.98], [600, 313.71], [700, 345.28], [800, 375.70], [850, 390.48]];

test('Pt100 y Pt1000: tabla de IEC 60751', () => {
  for (const [t, R] of PT100) {
    near(rtdResistance('pt100', t), R, 0.005, `Pt100 a ${t} °C`);
    near(rtdResistance('pt1000', t), R * 10, 0.05, `Pt1000 a ${t} °C`);
    near(rtdTemperature('pt100', R), t, 0.005 / rtdSensitivity('pt100', t) + 1e-9, `Pt100 con ${R} Ω`);
  }
  near(rtdSensitivity('pt100', 0), 0.39083, 1e-5, 'dR/dt del Pt100 a 0 °C');
});

test('Ni120: tabla de Minco en puntos entre nodos (±0,002 Ω)', () => {
  const MINCO = [[-75, 69.8508], [-45, 89.4531], [-15, 109.560], [-5, 116.482], [5, 123.562],
    [15, 130.820], [25, 138.265], [55, 161.796], [85, 187.218], [105, 205.220], [145, 243.865],
    [155, 254.093], [165, 264.561], [175, 275.296], [185, 286.320], [205, 309.337], [235, 346.592],
    [255, 373.373], [258, 377.524]];
  for (const [t, R] of MINCO) near(rtdResistance('ni120', t), R, 0.002, `Ni120 a ${t} °C`);
  near(rtdResistance('ni120', 0), 120, 1e-9, 'Ni120 a 0 °C');
  near(rtdResistance('ni120', 100), 200.640, 1e-9, 'Ni120 a 100 °C');
});

test('Ni100 DIN 43760: fórmula y α = 0,00618', () => {
  near(rtdResistance('ni100', 100), 161.78, 0.005, 'Ni100 a 100 °C');
  near(rtdResistance('ni1000', 100), 1617.8, 0.05, 'Ni1000 a 100 °C');
  near(rtdResistance('ni100', -60), 69.52, 0.005, 'Ni100 a −60 °C');
});

test('RTD: ida y vuelta en todo el rango, monotonía y fuera de rango', () => {
  for (const [type, s] of Object.entries(RTD_TYPES)) {
    let prev = -Infinity;
    for (let t = s.tmin; t <= s.tmax; t += 0.5) {
      const R = rtdResistance(type, t);
      assert.ok(R > prev, `${type} no es creciente en ${t} °C`);
      prev = R;
      near(rtdTemperature(type, R), t, 1e-6, `${type} a ${t} °C`);
    }
    assert.ok(Number.isNaN(rtdResistance(type, s.tmin - 1)), `${type} bajo rango`);
    assert.ok(Number.isNaN(rtdResistance(type, s.tmax + 1)), `${type} sobre rango`);
    assert.ok(Number.isNaN(rtdTemperature(type, s.R(s.tmax) * 1.01)), `${type} R excesiva`);
    assert.ok(Number.isNaN(rtdTemperature(type, s.R(s.tmin) * 0.99)), `${type} R escasa`);
  }
});
