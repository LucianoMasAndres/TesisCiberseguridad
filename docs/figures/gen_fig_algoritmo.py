# -*- coding: utf-8 -*-
"""Figura: diagrama de flujo del algoritmo classifyAsset (Anexo E)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon
from matplotlib.path import Path

fig, ax = plt.subplots(figsize=(7, 6.2))
ax.set_xlim(0, 10)
ax.set_ylim(2.8, 15)
ax.axis('off')

def box(x, y, w, h, text, fc='#dbe9f6', fontsize=9.5):
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.15", fc=fc, ec='#2471a3', linewidth=1.3)
    ax.add_patch(b)
    ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=fontsize, wrap=True)
    return (x + w/2, y), (x + w/2, y + h)

def diamond(cx, cy, w, h, text, fontsize=9):
    pts = [(cx, cy + h/2), (cx + w/2, cy), (cx, cy - h/2), (cx - w/2, cy)]
    p = Polygon(pts, closed=True, fc='#fdebd0', ec='#b9770e', linewidth=1.3)
    ax.add_patch(p)
    ax.text(cx, cy, text, ha='center', va='center', fontsize=fontsize)

def arrow(p1, p2, text=None, offset=(0.3, 0)):
    a = FancyArrowPatch(p1, p2, arrowstyle='-|>', mutation_scale=14, color='#333333', linewidth=1.2)
    ax.add_patch(a)
    if text:
        mx, my = (p1[0]+p2[0])/2, (p1[1]+p2[1])/2
        ax.text(mx + offset[0], my + offset[1], text, fontsize=8, color='#555555')

# Nodo 1
_, top1 = box(2.5, 13, 5, 1.2, "Entrada: lista de puertos\nabiertos del activo")
bot1 = (5, 13)

# Nodo 2
_, top2 = box(2.5, 10.8, 5, 1.2, "score = Σ SERVICE_WEIGHTS[puerto]\n(peso 1 si el puerto no está catalogado)")
arrow(bot1, (5, 12), )
bot2 = (5, 10.8)

# Decision 1
diamond(5, 9.2, 3.6, 1.6, "score > 20 ?")
arrow(bot2, (5, 10))

# Rama Critico
box(7.2, 8.6, 2.4, 1.0, "Crítico", fc='#f5b7b1')
arrow((5.8, 9.2), (7.15, 9.1), "sí", offset=(0, 0.28))

# Decision 2 (si no)
diamond(5, 6.6, 3.6, 1.6, "score > 10 ?")
arrow((5, 8.4), (5, 7.4), "no")

# Rama Alto
box(7.2, 6.0, 2.4, 1.0, "Alto", fc='#fad7a0')
arrow((5.8, 6.6), (7.15, 6.5), "sí", offset=(0, 0.28))

# Rama Normal
box(2.6, 3.8, 2.4, 1.0, "Normal", fc='#a9dfbf')
arrow((5, 5.8), (3.8, 4.8), "no")

ax.set_title("Algoritmo de clasificación de criticidad (classifyAsset)\nAnexo E — verificado con 12/12 casos de prueba", fontsize=11)

plt.tight_layout()
plt.savefig('fig4_flujo_algoritmo.png', dpi=150)
print("OK: fig4_flujo_algoritmo.png generada")
