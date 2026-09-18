#!/usr/bin/env python3
# Compañero de docs/cronometro_manual.py: encadenalo al final del comando
# real para que el hito se marque solo apenas ese comando termina, sin
# volver a la terminal del cronometro ni tocar ENTER.
#
# Ejemplo (Nmap termina -> se marca T1 solo):
#   nmap -sV -p- 172.20.0.13 ; python docs/marcar.py
#
# Tambien sirve para marcar a mano un hito sin comando asociado (ej. "termine
# de clasificar", "termine el reporte de Greenbone") corriendolo suelto
# cuando corresponda.

import os
import sys

SIGNAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cronometro_signal")


def main():
    with open(SIGNAL_PATH, "w", encoding="utf-8") as f:
        f.write("marca")
    print(f"Señal enviada ({SIGNAL_PATH}). El cronometro deberia marcar el hito en <1s.")


if __name__ == "__main__":
    main()
