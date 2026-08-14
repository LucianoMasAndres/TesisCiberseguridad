# -*- coding: utf-8 -*-
"""Figura 2: diagrama de secuencia del protocolo GMP (4.4/4.5)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

actors = ['Nodo Code\n(n8n)', 'gvmd\n(socket Unix)', 'ospd-openvas']
xpos = [1.5, 6.0, 10.5]

fig, ax = plt.subplots(figsize=(9, 8))
ax.set_xlim(0, 12)
ax.set_ylim(0, 12)
ax.axis('off')

# lifelines
for x, name in zip(xpos, actors):
    b = FancyBboxPatch((x-1.1, 10.6), 2.2, 0.9, boxstyle="round,pad=0.1", fc='#dbe9f6', ec='#2471a3')
    ax.add_patch(b)
    ax.text(x, 11.05, name, ha='center', va='center', fontsize=8.5)
    ax.plot([x, x], [1.9, 10.6], color='#999999', linestyle='--', linewidth=1)

messages = [
    (0, 1, "create_target(host)", 9.8),
    (1, 0, "target_id", 9.3),
    (0, 1, "create_task(target_id, config)", 8.7),
    (1, 0, "task_id", 8.2),
    (0, 1, "start_task(task_id)", 7.6),
    (1, 2, "delega escaneo NVT", 7.1),
    (1, 0, "report_id", 6.6),
    (0, 1, "get_tasks(task_id)  [poll]", 5.8),
    (1, 0, "status: Requested/Running", 5.3),
    (2, 1, "resultados NVT (async)", 4.6),
    (0, 1, "get_reports(report_id,\nfilter='rows=1000')", 3.6),
    (1, 0, "XML con <host> y <result>\npor cada hallazgo", 2.9),
]

for src, dst, text, y in messages:
    x1, x2 = xpos[src], xpos[dst]
    color = '#2471a3' if src < dst else '#b9770e'
    a = FancyArrowPatch((x1, y), (x2, y), arrowstyle='-|>', mutation_scale=12,
                         color=color, linewidth=1.1,
                         connectionstyle="arc3,rad=0.0")
    ax.add_patch(a)
    mx = (x1 + x2) / 2
    ax.text(mx, y + 0.18, text, ha='center', va='bottom', fontsize=7.3, color='#333333')

ax.text(6.0, 1.4,
        "El nodo de código (Python) sondea get_tasks() hasta status=Done\n"
        "antes de invocar get_reports(); rows=1000 evita la paginación\n"
        "por defecto de GMP (10 resultados) — bug corregido en esta versión.",
        ha='center', va='center', fontsize=7.8, style='italic', color='#555555')

ax.set_title("Diagrama de secuencia — protocolo GMP\n(4.4/4.5 — elaboración propia a partir de docs/run_experiment.js)", fontsize=11)

plt.tight_layout()
plt.savefig('fig2_secuencia_gmp.png', dpi=150)
print("OK: fig2_secuencia_gmp.png generada")
