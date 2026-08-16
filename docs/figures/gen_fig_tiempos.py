# -*- coding: utf-8 -*-
"""Figura: comparacion de tiempos totales por repeticion, manual vs automatizado.
Datos reales de docs/experiment_results.jsonl (auto) y Tabla 4 del docx (manual, heredado).
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

manual_s = [4225, 4280, 4275, 4323, 4147]  # 70:25, 71:20, 71:15, 72:03, 69:07
auto_s = [1761.5, 1731.9, 1672.2, 1733.8, 1944.3]

manual_min = [s / 60 for s in manual_s]
auto_min = [s / 60 for s in auto_s]

reps = np.arange(1, 6)
width = 0.35

fig, ax = plt.subplots(figsize=(8, 5))
bars1 = ax.bar(reps - width/2, manual_min, width, label='Manual (heredado)', color='#c0392b')
bars2 = ax.bar(reps + width/2, auto_min, width, label='Automatizado (re-ejecutado 14/08/2026)', color='#2471a3')

ax.set_xlabel('Repetición')
ax.set_ylabel('Tiempo total del ciclo (minutos)')
ax.set_title('Tiempo total del ciclo completo por repetición\n(manual vs. automatizado, n=5 cada condición)')
ax.set_xticks(reps)
ax.set_ylim(0, 85)
ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.12), ncol=2, frameon=False)
ax.grid(axis='y', linestyle='--', alpha=0.4)

for bars in (bars1, bars2):
    for b in bars:
        h = b.get_height()
        ax.annotate(f'{h:.1f}', xy=(b.get_x() + b.get_width()/2, h),
                    xytext=(0, 3), textcoords='offset points', ha='center', fontsize=8)

plt.tight_layout()
plt.savefig('fig7_tiempos_por_repeticion.png', dpi=150)
print("OK: fig7_tiempos_por_repeticion.png generada")
