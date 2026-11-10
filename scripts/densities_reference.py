#!/usr/bin/env python3
"""Genera js/densities-data.js y tests/fixtures/densities-reference.json con CoolProp.

    pip install CoolProp
    python3 scripts/densities_reference.py

Los valores de los fluidos puros salen de las ecuaciones de estado de referencia que trae
CoolProp (se citan en el campo `source` de cada fluido). Las mezclas agua-glicol salen del
modelo incompresible de CoolProp (Melinder). Los puntos de comprobación de los tests
(fuera de la rejilla, para validar la interpolación) también salen de aquí.
"""
import json
from pathlib import Path

import CoolProp
from CoolProp.CoolProp import PropsSI as P, get_BibTeXKey as BIB

ROOT = Path(__file__).resolve().parent.parent
ATM = 101325.0
STEP = 5  # °C entre puntos de la tabla

# id, nombre, CoolProp, Tmin, Tmax (°C), condición: 'atm' (1 atm) o 'sat' (saturado)
LIQUIDS = [
    ('water', 'Agua', 'Water', 5, 95, 'atm', 'Agua'),
    ('ethanol', 'Etanol', 'Ethanol', 0, 70, 'atm', 'Disolventes y combustibles'),
    ('methanol', 'Metanol', 'Methanol', 0, 60, 'atm', 'Disolventes y combustibles'),
    ('acetone', 'Acetona', 'Acetone', 0, 50, 'atm', 'Disolventes y combustibles'),
    ('benzene', 'Benceno', 'Benzene', 10, 75, 'atm', 'Disolventes y combustibles'),
    ('toluene', 'Tolueno', 'Toluene', 0, 105, 'atm', 'Disolventes y combustibles'),
    ('pentane', 'n-Pentano', 'n-Pentane', 0, 30, 'atm', 'Disolventes y combustibles'),
    ('hexane', 'n-Hexano', 'n-Hexane', 0, 65, 'atm', 'Disolventes y combustibles'),
    ('heptane', 'n-Heptano', 'n-Heptane', 0, 95, 'atm', 'Disolventes y combustibles'),
    ('propane', 'Propano líquido', 'Propane', -40, 60, 'sat', 'Gases licuados (saturado)'),
    ('butane', 'n-Butano líquido', 'n-Butane', -20, 100, 'sat', 'Gases licuados (saturado)'),
    ('isobutane', 'Isobutano líquido', 'IsoButane', -20, 90, 'sat', 'Gases licuados (saturado)'),
    ('ammonia', 'Amoníaco líquido', 'Ammonia', -30, 80, 'sat', 'Gases licuados (saturado)'),
    ('co2', 'CO₂ líquido', 'CarbonDioxide', -50, 25, 'sat', 'Gases licuados (saturado)'),
]
# Sin referencia propia de viscosidad en CoolProp (usa un modelo genérico): no se publica μ.
NO_VISCOSITY = {'Acetone'}

# (id, nombre, % masa, Tmin °C, Tmax °C) — el límite frío deja margen sobre el punto de congelación.
GLYCOLS = [
    ('meg', 'Etilenglicol', [(20, -5, 100), (30, -10, 100), (40, -20, 100), (50, -30, 100)]),
    ('mpg', 'Propilenglicol', [(20, -5, 100), (30, -10, 100), (40, -20, 100), (50, -30, 100)]),
]

# id, nombre, CoolProp
GASES = [
    ('air', 'Aire seco', 'Air'),
    ('nitrogen', 'Nitrógeno N₂', 'Nitrogen'),
    ('oxygen', 'Oxígeno O₂', 'Oxygen'),
    ('hydrogen', 'Hidrógeno H₂', 'Hydrogen'),
    ('helium', 'Helio He', 'Helium'),
    ('argon', 'Argón Ar', 'Argon'),
    ('co2', 'Dióxido de carbono CO₂', 'CarbonDioxide'),
    ('co', 'Monóxido de carbono CO', 'CarbonMonoxide'),
    ('methane', 'Metano CH₄', 'Methane'),
    ('ethane', 'Etano C₂H₆', 'Ethane'),
    ('propane', 'Propano C₃H₈', 'Propane'),
    ('butane', 'n-Butano C₄H₁₀', 'n-Butane'),
    ('h2s', 'Sulfuro de hidrógeno H₂S', 'HydrogenSulfide'),
    ('ammonia', 'Amoníaco NH₃', 'Ammonia'),
]

STEAM_P_BAR = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200]


def r(x, nd):
    return round(float(x), nd)


def sig(x, n=4):
    return float(f'{x:.{n}g}')


def liquid_density(fluid, t_c, cond):
    t = t_c + 273.15
    return P('D', 'T', t, 'Q', 0, fluid) if cond == 'sat' else P('D', 'T', t, 'P', ATM, fluid)


def liquid_mu(fluid, t_c, cond):
    t = t_c + 273.15
    v = P('V', 'T', t, 'Q', 0, fluid) if cond == 'sat' else P('V', 'T', t, 'P', ATM, fluid)
    return v * 1000  # mPa·s


def grid(t0, t1):
    n = (t1 - t0) // STEP
    assert t0 + n * STEP == t1, (t0, t1)
    return [t0 + i * STEP for i in range(n + 1)]


def main():
    data = {'liquids': [], 'glycols': [], 'gases': [], 'steam': {}}
    ref = {'liquids': [], 'glycols': [], 'gases': [], 'steam': []}

    for id_, name, f, t0, t1, cond, group in LIQUIDS:
        ts = grid(t0, t1)
        item = {
            'id': id_, 'name': name, 'group': group, 'cond': cond,
            't0': t0, 'step': STEP,
            'rho': [r(liquid_density(f, t, cond), 2) for t in ts],
            'source': f'CoolProp {CoolProp.__version__}: ecuación de estado {BIB(f, "EOS")}',
        }
        if f not in NO_VISCOSITY:
            item['mu'] = [sig(liquid_mu(f, t, cond)) for t in ts]
            item['source'] += f'; viscosidad {BIB(f, "VISCOSITY")}'
        data['liquids'].append(item)
        for t in (t0 + 2.5, (t0 + t1) / 2 + 1.3, t1 - 1.1):
            ref['liquids'].append({'id': id_, 't': t, 'rho': liquid_density(f, t, cond),
                                    'mu': None if f in NO_VISCOSITY else liquid_mu(f, t, cond)})

    for gid, gname, fluids in GLYCOLS:
        for pct, t0, t1 in fluids:
            n = f'INCOMP::{gid.upper()}-{pct}%'
            ts = grid(t0, t1)
            item = {
                'id': f'{gid}{pct}', 'name': f'{gname} {pct} % en masa (agua)', 'group': 'Glicoles y anticongelantes',
                'cond': 'atm', 't0': t0, 'step': STEP,
                'rho': [r(P('D', 'T', t + 273.15, 'P', ATM, n), 2) for t in ts],
                'mu': [sig(P('V', 'T', t + 273.15, 'P', ATM, n) * 1000) for t in ts],
                'source': f'CoolProp {CoolProp.__version__}: modelo incompresible de mezclas agua-glicol (Melinder, '
                          f'Properties of Secondary Working Fluids for Indirect Systems, IIR 2010)',
            }
            data['glycols'].append(item)
            for t in (t0 + 2.5, (t0 + t1) / 2 + 1.3, t1 - 1.1):
                ref['glycols'].append({'id': item['id'], 't': t, 'rho': P('D', 'T', t + 273.15, 'P', ATM, n),
                                       'mu': P('V', 'T', t + 273.15, 'P', ATM, n) * 1000})

    for id_, name, f in GASES:
        kappa = P('Cpmass', 'T', 298.15, 'P', ATM, f) / P('Cvmass', 'T', 298.15, 'P', ATM, f)
        data['gases'].append({
            'id': id_, 'name': name,
            'M': r(P('molar_mass', f) * 1000, 4),
            'Tc': r(P('Tcrit', f), 3), 'Pc': r(P('pcrit', f) / 1e5, 4),
            'omega': r(P('acentric', f), 4),
            'kappa': r(kappa, 3),
            'source': f'CoolProp {CoolProp.__version__}: constantes críticas y masa molar de {BIB(f, "EOS")}; κ = cp/cv real a 25 °C y 1 atm',
        })
        for t_c in (0, 25, 80):
            for p_bar in (1.01325, 10, 40):
                t = t_c + 273.15
                p = p_bar * 1e5
                # solo estados claramente gaseosos (por encima del punto de rocío y de 1,05 veces la T de burbuja)
                try:
                    tsat = P('T', 'P', p, 'Q', 1, f) if p < P('pcrit', f) else 0
                except ValueError:
                    tsat = 0
                if t > tsat * 1.12 or tsat == 0:
                    z = P('Z', 'T', t, 'P', p, f)
                    ref['gases'].append({'id': id_, 'T': t, 'p': p, 'Z': z, 'rho': P('D', 'T', t, 'P', p, f),
                                         'tsat': tsat})
        # presión de saturación para los gases subcríticos (comprobar la condensación)
        ref['gases'].append({'id': id_, 'psat': [[t, P('P', 'T', t, 'Q', 1, f)] for t in (260, 280, 300, 320)
                                                  if t < P('Tcrit', f) - 3 and t > P('Tmin', f)]})

    data['steam'] = {
        'p': STEAM_P_BAR,
        'T': [r(P('T', 'P', p * 1e5, 'Q', 1, 'Water') - 273.15, 2) for p in STEAM_P_BAR],
        'rhoV': [sig(P('D', 'P', p * 1e5, 'Q', 1, 'Water'), 5) for p in STEAM_P_BAR],
        'rhoL': [r(P('D', 'P', p * 1e5, 'Q', 0, 'Water'), 2) for p in STEAM_P_BAR],
        'source': f'CoolProp {CoolProp.__version__}: {BIB("Water", "EOS")} (IAPWS-95)',
    }
    for p in (0.8, 2.5, 7, 13.5, 35, 90):
        ref['steam'].append({'p': p, 'T': P('T', 'P', p * 1e5, 'Q', 1, 'Water') - 273.15,
                             'rhoV': P('D', 'P', p * 1e5, 'Q', 1, 'Water'),
                             'rhoL': P('D', 'P', p * 1e5, 'Q', 0, 'Water')})

    js = ['// Datos de densidad y viscosidad. GENERADO por scripts/densities_reference.py: no editar a mano.',
          '// Los valores salen de CoolProp (ecuaciones de estado de referencia); la fuente de cada fluido está en `source`.',
          f'export const DATA = {json.dumps(data, ensure_ascii=False, separators=(",", ":"))};', '']
    (ROOT / 'js' / 'densities-data.js').write_text('\n'.join(js), encoding='utf-8')
    fx = ROOT / 'tests' / 'fixtures'
    fx.mkdir(exist_ok=True)
    (fx / 'densities-reference.json').write_text(json.dumps(ref, indent=1) + '\n', encoding='utf-8')
    print('ok', len(data['liquids']), 'líquidos,', len(data['glycols']), 'mezclas,', len(data['gases']), 'gases')


if __name__ == '__main__':
    main()
