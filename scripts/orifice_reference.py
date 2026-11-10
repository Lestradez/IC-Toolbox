# Genera los casos de referencia de tests/orifice.test.js con la librería independiente
# `fluids` (https://github.com/CalebBell/fluids), que implementa ISO 5167-2:2003.
#   python3 -m venv venv && venv/bin/pip install fluids scipy && venv/bin/python scripts/orifice_reference.py
# Escribe ref.json y muestra un resumen; copiar los valores al array REF del test.
import json
from fluids.flow_meter import (C_Reader_Harris_Gallagher, orifice_expansibility,
    differential_pressure_meter_solver, dP_orifice)
print(C_Reader_Harris_Gallagher(D=0.07391, Do=0.0222, rho=1.165, mu=1.85E-5, m=0.12, taps='flange'))
TAPMAP={'corner':'corner','flange':'flange','dd2':'D'}
cases=[]
# Directo: líquidos y gases, varias D (incl. < 71.12 mm), betas y tomas
specs=[
 # D, d, P1, dP, rho, mu, k(None=liquido), taps
 (0.07793,0.040,  5e5, 25000, 850*0.4+1050*0.6, 15e-3, None,'flange'),   # ejemplo del HTML (3" Sch40, 250 mbar)
 (0.10226,0.0511, 3e5, 20000, 998.2, 1.002e-3, None,'corner'),
 (0.2027, 0.1418, 8e5, 50000, 998.2, 1.002e-3, None,'dd2'),
 (0.05250,0.0300, 4e5, 10000, 1000., 1e-3,    None,'flange'),           # D < 71,12 mm
 (0.3048, 0.0610, 2e6, 6000,  800., 2e-3,     None,'corner'),           # beta = 0.2
 (0.1541, 0.1100, 5e6, 30000, None, 1.1e-5,   1.30,'flange'),           # gas natural
 (0.07391,0.0222, 1e5, 1000,  1.165,1.85e-5,  1.40,'flange'),
 (0.2545, 0.1527, 1.2e6,60000,None, 1.2e-5,   1.31,'dd2'),
]
for D,d,P1,dP,rho,mu,k,t in specs:
    if rho is None:
        rho = P1*0.01804/(0.92*8.314462618*(273.15+25))  # gas natural aprox, M=18.04 g/mol, Z=0.92
    kw=dict(D=D, D2=d, P1=P1, P2=P1-dP, rho=rho, mu=mu, k=k if k else 1.4,
            meter_type='ISO 5167 orifice', taps=TAPMAP[t])
    m = differential_pressure_meter_solver(**kw)
    C = C_Reader_Harris_Gallagher(D=D, Do=d, rho=rho, mu=mu, m=m, taps=TAPMAP[t])
    eps = orifice_expansibility(D=D, Do=d, P1=P1, P2=P1-dP, k=k) if k else 1.0
    if not k:
        # fluids aplica siempre epsilon; para liquido recalculamos con eps=1 resolviendo a mano
        import math
        from scipy.optimize import brentq
        beta=d/D
        def g(mm):
            Cc=C_Reader_Harris_Gallagher(D=D, Do=d, rho=rho, mu=mu, m=mm, taps=TAPMAP[t])
            return Cc/math.sqrt(1-beta**4)*math.pi/4*d*d*math.sqrt(2*dP*rho)-mm
        m=brentq(g,1e-9,1e5,xtol=1e-14)
        C = C_Reader_Harris_Gallagher(D=D, Do=d, rho=rho, mu=mu, m=m, taps=TAPMAP[t])
    loss = dP_orifice(D=D, Do=d, P1=P1, P2=P1-dP, C=C)
    cases.append(dict(D=D,d=d,p1=P1,dp=dP,rho=rho,mu=mu,kappa=k,taps=t,qm=m,C=C,eps=eps,loss=loss))
json.dump(cases, open('ref.json','w'), indent=1)
for c in cases: print(c['taps'], round(c['qm'],8), round(c['C'],8), round(c['eps'],8), round(c['loss'],3))
