# -*- coding: utf-8 -*-
"""Figura: heatmap de la matriz de confusion real (55 comparaciones, 5 repeticiones)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

labels = ['Normal', 'Alto', 'Crítico']
matrix = np.array([
    [10, 0, 0],
    [5, 25, 0],
    [0, 4, 11],
])

fig, ax = plt.subplots(figsize=(6.5, 5))
im = ax.imshow(matrix, cmap='Blues')

ax.set_xticks(range(3))
ax.set_yticks(range(3))
ax.set_xticklabels(labels)
ax.set_yticklabels(labels)
ax.set_xlabel('Clase obtenida')
ax.set_ylabel('Clase esperada (Anexo F)')
ax.set_title('Matriz de confusión — clasificación de criticidad\n(55 comparaciones, 5 repeticiones reales)')

for i in range(3):
    for j in range(3):
        val = matrix[i, j]
        color = 'white' if val > 12 else 'black'
        ax.text(j, i, str(val), ha='center', va='center', color=color, fontsize=14, fontweight='bold')

plt.colorbar(im, ax=ax, label='Cantidad de casos')
plt.tight_layout()
plt.savefig('fig3_matriz_confusion.png', dpi=150)
print("OK: fig3_matriz_confusion.png generada")
