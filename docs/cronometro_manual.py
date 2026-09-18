#!/usr/bin/env python3
# Cronometro con marcado automatico para el brazo manual (condicion de
# comparacion, Tabla 4 / Tabla 2). Mismos 4 hitos que docs/manual_arm_log.js
# y mismo formato de salida (docs/manual_arm_results.jsonl), pero cada hito
# se puede marcar solo en vez de tener que volver a esta terminal y tocar
# ENTER: encadena `python docs/marcar.py` al final del comando real y la
# marca llega apenas ese comando termina.
#
# Formas de marcar un hito (cualquiera funciona, la que llegue primero gana):
#   (a) encadenar el comando real con el marcador:
#         nmap -sV -p- 172.20.0.13 ; python docs/marcar.py
#   (b) mandar SIGUSR1 (Linux/WSL) o CTRL_BREAK/SIGBREAK (Windows, misma
#       consola) al proceso de este script
#   (c) presionar ENTER en esta terminal (respaldo para hitos sin comando,
#       ej. clasificacion a mano o el ciclo de Greenbone por GUI)
#
# Uso:
#   python docs/cronometro_manual.py --rep 1
#   python docs/cronometro_manual.py --rep 1 --test   (modo de prueba, sin espera real)

import argparse
import json
import os
import signal as signal_module
import sys
import threading
import time
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_PATH = os.path.join(BASE_DIR, "manual_arm_results.jsonl")
SIGNAL_PATH = os.path.join(BASE_DIR, ".cronometro_signal")

HITOS = [
    ("t0_inicio", 'T0 - a punto de arrancar Nmap desde la terminal'),
    ("t1_fin_nmap", 'T1 - fin de Nmap + analisis visual del output (fin de "Manual Nmap")'),
    ("t2_fin_clasificacion", 'T2 - fin de clasificar a mano los activos (fin de "Manual clasif.")'),
    ("t3_fin_gvm", 'T3 - fin de TODO el ciclo de Greenbone (target, lanzar, esperar, reporte) '
                   'Y la redaccion del informe (fin de "Manual GVM + reporte")'),
]

_signal_event = threading.Event()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def fmt_min_sec(total_seconds):
    m = int(total_seconds // 60)
    s = round(total_seconds % 60)
    return f"{m}:{s:02d}"


def _handle_os_signal(signum, frame):
    _signal_event.set()


def install_os_signals():
    # SIGUSR1 (Linux/WSL) y SIGBREAK (Windows, requiere CTRL_BREAK_EVENT en
    # la misma consola) -- si no existen en esta plataforma, se ignoran y
    # queda el archivo de señal / ENTER como via de marcado.
    for name in ("SIGUSR1", "SIGBREAK"):
        sig = getattr(signal_module, name, None)
        if sig is not None:
            try:
                signal_module.signal(sig, _handle_os_signal)
            except (ValueError, OSError):
                pass


def _watch_enter():
    try:
        line = sys.stdin.readline()
    except Exception:
        return
    if line == "":
        # EOF (stdin cerrado/no interactivo): no es un ENTER real, ignorar.
        return
    _signal_event.set()


def wait_for_signal(prompt, test_mode):
    print(f"\n{prompt}")
    if test_mode:
        print("  [--test: avanzando automaticamente]")
        time.sleep(0.3)
        return now_iso()

    print("  Se marca sola con `python docs/marcar.py` encadenado al comando real,")
    print("  con una señal SIGUSR1/SIGBREAK a este proceso, o presionando ENTER aca.")

    _signal_event.clear()
    if os.path.exists(SIGNAL_PATH):
        os.remove(SIGNAL_PATH)

    threading.Thread(target=_watch_enter, daemon=True).start()

    start = time.time()
    while True:
        if _signal_event.is_set():
            break
        if os.path.exists(SIGNAL_PATH):
            try:
                os.remove(SIGNAL_PATH)
            except OSError:
                pass
            break
        elapsed = time.time() - start
        print(f"\r  cronometro: {fmt_min_sec(elapsed)}   ", end="", flush=True)
        time.sleep(0.2)
    print()
    return now_iso()


def parse_args():
    parser = argparse.ArgumentParser(description="Cronometro con marcado automatico del brazo manual")
    parser.add_argument("--rep", type=int, required=True)
    parser.add_argument("--test", action="store_true", help="modo de prueba, sin espera real")
    return parser.parse_args()


def main():
    args = parse_args()
    install_os_signals()

    print("=" * 62)
    print(f"  Cronometro brazo manual -- Repeticion {args.rep}")
    print("=" * 62)
    print("Vos haces el proceso real (Nmap por terminal, clasificacion a mano,")
    print("Greenbone por la interfaz web). Este script solo mide los tiempos.")
    if args.test:
        print("\n[MODO --test: avanza solo, para validar el script, no genera dato real]")

    timestamps = {}
    for key, prompt in HITOS:
        timestamps[key] = wait_for_signal(prompt, args.test)

    t0 = datetime.fromisoformat(timestamps["t0_inicio"])
    t1 = datetime.fromisoformat(timestamps["t1_fin_nmap"])
    t2 = datetime.fromisoformat(timestamps["t2_fin_clasificacion"])
    t3 = datetime.fromisoformat(timestamps["t3_fin_gvm"])

    fases_seg = {
        "nmap_s": (t1 - t0).total_seconds(),
        "clasificacion_s": (t2 - t1).total_seconds(),
        "gvm_reporte_s": (t3 - t2).total_seconds(),
        "total_s": (t3 - t0).total_seconds(),
    }

    registro = {
        "repeticion": args.rep,
        "test": args.test,
        "timestamps": timestamps,
        "fases_seg": fases_seg,
        "fases_fmt": {
            "nmap": fmt_min_sec(fases_seg["nmap_s"]),
            "clasificacion": fmt_min_sec(fases_seg["clasificacion_s"]),
            "gvm_reporte": fmt_min_sec(fases_seg["gvm_reporte_s"]),
            "total": fmt_min_sec(fases_seg["total_s"]),
        },
        "registrado_en": now_iso(),
    }

    with open(RESULTS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(registro) + "\n")

    print(f"\n--- Resumen de la repeticion {args.rep} ---")
    print("Manual Nmap:         ", registro["fases_fmt"]["nmap"], "min")
    print("Manual clasif.:      ", registro["fases_fmt"]["clasificacion"], "min")
    print("Manual GVM + reporte:", registro["fases_fmt"]["gvm_reporte"], "min")
    print("Manual total:        ", registro["fases_fmt"]["total"], "min")
    print(f"\nRegistro agregado a {RESULTS_PATH}")
    if args.test:
        print("(Este fue un registro de --test. Si no queres que cuente como")
        print(" repeticion real, borralo de manual_arm_results.jsonl antes de")
        print(" correr la primera repeticion real con el mismo numero.)")


if __name__ == "__main__":
    main()
