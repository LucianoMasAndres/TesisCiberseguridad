# -*- coding: utf-8 -*-
"""Figura 1: arquitectura de despliegue de dos capas (Anexo 4.1)."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(9, 7.5))
ax.set_xlim(0, 13)
ax.set_ylim(0, 10.2)
ax.axis('off')

def box(x, y, w, h, text, fc='#dbe9f6', ec='#2471a3', fontsize=9):
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.12", fc=fc, ec=ec, linewidth=1.3)
    ax.add_patch(b)
    ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=fontsize)
    return b

def arrow(p1, p2, fc='#333333'):
    a = FancyArrowPatch(p1, p2, arrowstyle='-|>', mutation_scale=13, color=fc, linewidth=1.2)
    ax.add_patch(a)

def label(pos, text, ha='center'):
    ax.text(pos[0], pos[1], text, fontsize=7.3, color='#333333', ha=ha, va='center',
             bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='#999999', alpha=0.9))

# Capa 1: contenedor n8n personalizado
box(0.4, 6.6, 4.6, 2.6,
    "Contenedor n8n personalizado\n(Dockerfile propio)\n\n- Motor n8n + workflow\n- Nmap (setuid)\n- gvm-tools / python-gvm",
    fc='#dbe9f6', fontsize=8.3)

# Capa 2: pila Greenbone (17 servicios, simplificada)
box(6.9, 5.8, 4.7, 3.4,
    "Pila Greenbone Community Edition\n(17 servicios Docker Compose)\n\ngvmd  ·  ospd-openvas  ·  notus\npg-gvm (PostgreSQL)  ·  redis-server\nvulnerability-tests  ·  configure-openvas",
    fc='#fdebd0', ec='#b9770e', fontsize=8)

# Socket Unix GMP (etiqueta bien despegada de la flecha, con fondo blanco)
arrow((5.0, 8.6), (6.9, 8.6))
label((5.95, 9.0), "GMP sobre socket Unix\n(gvmd_socket_vol)")

# Red lab-net y objetivos (desplazada a la derecha, bajo Greenbone)
box(5.4, 3.2, 4.6, 1.6,
    "Red Docker 'lab-net'\n12 activos objetivo (lab-targets)\nSSH, FTP, SMB, HTTP, MySQL, SNMP, etc.",
    fc='#eaf2e3', ec='#2e7d32', fontsize=8)

arrow((3.5, 6.6), (5.9, 4.8))
label((1.9, 5.7), "Nmap\n(descubrimiento y puertos)", ha='center')

arrow((9.0, 5.8), (8.4, 4.8))
label((11.0, 5.35), "OpenVAS\n(análisis de\nvulnerabilidades)", ha='left')

# Notificaciones (a la izquierda, sin cruzar la red lab-net)
box(0.4, 0.5, 2.4, 1.6, "Telegram\n(bot API)", fc='#f5e0f5', ec='#8e44ad', fontsize=8.3)
box(3.1, 0.5, 2.4, 1.6, "Mailpit\n(SMTP local)", fc='#f5e0f5', ec='#8e44ad', fontsize=8.3)

arrow((1.6, 6.6), (1.6, 2.1))
arrow((4.3, 6.6), (4.3, 2.1))
label((2.95, 4.35), "resultados\n(Telegram + Mailpit)")

ax.set_title("Arquitectura de despliegue de dos capas\n(4.1 — elaboración propia a partir de docker-compose.yml)", fontsize=11)

plt.tight_layout()
plt.savefig('fig1_arquitectura.png', dpi=150)
print("OK: fig1_arquitectura.png generada")
