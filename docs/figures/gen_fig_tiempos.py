# -*- coding: utf-8 -*-
"""Figura 8: tiempo total del ciclo, brazo automatizado frente al brazo manual.

Las campanas no estan apareadas (distinta fecha, laboratorio y operador), asi que
no se dibujan barras apareadas por numero de repeticion: el brazo automatizado se
muestra repeticion por repeticion y cada medicion manual como una barra propia.

Fuentes:
- Automatizado: docs/experiment_results.jsonl (campana del 14/08/2026, n=5; la
  repeticion 4 se marca como comprometida, ver §5.3).
- Manual, remedicion: docs/manual_arm_results.jsonl (operador 1 y operador 2).
- Manual, heredado: media de la campana anterior (70:50), publicada sin registro
  crudo y medida sobre otra version del laboratorio; unico valor no leido de un
  archivo de datos.
"""
import json
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def read_jsonl(name):
    with open(os.path.join(DOCS, name), encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]


auto = read_jsonl('experiment_results.jsonl')
manual = [r for r in read_jsonl('manual_arm_results.jsonl') if not r.get('test')]
HEREDADO_S = 70 * 60 + 50

labels, values, colors, hatches = [], [], [], []
for r in auto:
    labels.append(f"Auto\nrep. {r['repeticion']}")
    values.append(r['duracion_total_s'] / 60)
    colors.append('#2471a3')
    hatches.append('//' if r['repeticion'] == 4 else '')
for r in manual:
    labels.append(f"Manual\noperador {r['operador']}")
    values.append(r['fases_seg']['total_s'] / 60)
    colors.append('#c0392b')
    hatches.append('')
labels.append('Manual\nheredado\n(media)')
values.append(HEREDADO_S / 60)
colors.append('#e6b0aa')
hatches.append('')

fig, ax = plt.subplots(figsize=(10, 5.6))
xs = list(range(len(values)))
bars = ax.bar(xs, values, color=colors, edgecolor='#333333', linewidth=0.6)
for b, h in zip(bars, hatches):
    b.set_hatch(h)
for b, v in zip(bars, values):
    # Mismo redondeo que docs/analyze_results.js (Math.round sobre los segundos)
    m, s = divmod(int(round(v * 60, 6) + 0.5), 60)
    ax.annotate(f'{m}:{s:02d}', xy=(b.get_x() + b.get_width() / 2, v), xytext=(0, 3),
                textcoords='offset points', ha='center', va='bottom', fontsize=8)

ax.axvline(len(auto) - 0.5, color='#999999', linestyle=':', linewidth=1)
ax.set_xticks(xs)
ax.set_xticklabels(labels, fontsize=8)
ax.set_ylabel('Tiempo total del ciclo (minutos)')
ax.set_title('Tiempo total del ciclo completo\n'
             'Automatizado: 14/08/2026, rep. 4 rayada (comprometida). Manual: operador 1 y 2 '
             '(septiembre de 2026, mismo laboratorio)\ny media heredada (otro laboratorio, sin registro crudo). '
             'Las barras no están apareadas.', fontsize=9)
ax.grid(axis='y', linestyle='--', alpha=0.4)
ax.set_axisbelow(True)

plt.tight_layout()
plt.savefig(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fig8_tiempos_por_repeticion.png'), dpi=150)
print("OK: fig8_tiempos_por_repeticion.png generada")
