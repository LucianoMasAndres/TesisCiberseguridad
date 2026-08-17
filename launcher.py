#!/usr/bin/env python3
"""
Security Lab Launcher — GUI standalone para controlar el laboratorio.
Corre en el host, sin necesitar Docker previamente levantado.
Requiere: python3-tk, docker, docker compose v2
"""
import os
import json
import queue
import shutil
import subprocess
import threading
import time
import urllib.request
import urllib.error
import http.cookiejar
import platform
import webbrowser
import tkinter as tk

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LAB_TARGETS_COMPOSE = os.path.join(SCRIPT_DIR, "lab-targets", "docker-compose.lab-targets.yml")
GVMD_CONTAINER = "greenbone-community-edition-gvmd-1"

DOCKER_DOWNLOAD_URL = {
    "Windows": "https://www.docker.com/products/docker-desktop/",
    "Darwin": "https://www.docker.com/products/docker-desktop/",
    "Linux": "https://docs.docker.com/engine/install/",
}

SCAN_PROFILES = {
    "Rápido  — Solo descubrimiento (~5 min)":   "8715c877-47a0-438d-98a3-27c7a6ab2196",
    "Normal  — Full & Fast (~30 min)":           "daba56c8-73ec-11df-a475-002264764cea",
    "Profundo — Full & Very Deep (~60 min)":     "708f25c4-7489-11df-8a11-002264764cea",
    "Máximo  — Full & Very Deep Ultimate (~90 min)": "74db13d6-7489-11df-91b9-002264764cea",
}

# Paleta
BG      = "#0f172a"
SURFACE = "#1e293b"
BORDER  = "#334155"
TEXT    = "#e2e8f0"
MUTED   = "#94a3b8"
GREEN   = "#22c55e"
RED     = "#ef4444"
YELLOW  = "#eab308"
BLUE    = "#3b82f6"
CYAN    = "#06b6d4"
BLACK   = "#000000"


class Launcher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Security Lab Launcher")
        self.geometry("860x560")
        self.minsize(720, 480)
        self.configure(bg=BG)

        self._q = queue.Queue()
        self._busy = False

        self._n8n_email = tk.StringVar()
        self._n8n_password = tk.StringVar()
        self._daily_scan = tk.BooleanVar(value=True)

        self._poll_queue()
        self._show_setup_or_dashboard()

    # ------------------------------------------------------------------
    # Verificación de requisitos (Docker / Docker Compose)
    # ------------------------------------------------------------------

    @staticmethod
    def _cmd_ok(cmd):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
            return r.returncode == 0
        except Exception:
            return False

    def _check_requirements(self):
        docker_installed = shutil.which("docker") is not None
        docker_daemon = docker_installed and self._cmd_ok(["docker", "info"])
        compose_ok = docker_installed and self._cmd_ok(["docker", "compose", "version"])
        return {
            "docker": docker_installed,
            "daemon": docker_daemon,
            "compose": compose_ok,
        }

    def _show_setup_or_dashboard(self):
        checks = self._check_requirements()
        if all(checks.values()):
            self._build_ui()
            self._schedule_status()
        else:
            self._build_setup_screen(checks)

    def _build_setup_screen(self, checks):
        for w in self.winfo_children():
            w.destroy()

        hdr = tk.Frame(self, bg=BG, padx=20, pady=16)
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Security Lab Launcher — Verificación de requisitos",
                 bg=BG, fg=CYAN, font=("Courier New", 14, "bold")).pack(side="left")

        sep = tk.Frame(self, bg=BORDER, height=1)
        sep.pack(fill="x", padx=20)

        body = tk.Frame(self, bg=BG, padx=30, pady=20)
        body.pack(fill="both", expand=True)

        card = self._card(body, "REQUISITOS DEL SISTEMA")
        inner = tk.Frame(card, bg=SURFACE, padx=16, pady=10)
        inner.pack(fill="x")

        rows = [
            ("docker", "Docker instalado", checks["docker"]),
            ("daemon", "Docker corriendo (daemon activo)", checks["daemon"]),
            ("compose", "Docker Compose v2", checks["compose"]),
        ]
        for _, label, ok in rows:
            row = tk.Frame(inner, bg=SURFACE)
            row.pack(fill="x", pady=4)
            color = GREEN if ok else RED
            symbol = "✓" if ok else "✗"
            tk.Label(row, text=symbol, bg=SURFACE, fg=color,
                     font=("Courier New", 12, "bold"), width=2).pack(side="left")
            tk.Label(row, text=label, bg=SURFACE, fg=TEXT,
                     font=("Courier New", 10)).pack(side="left")

        msg = tk.Frame(body, bg=BG, pady=14)
        msg.pack(fill="x")
        if not checks["docker"]:
            txt = ("Docker no está instalado en este equipo. Es el único requisito externo:\n"
                   "una vez instalado, el laboratorio completo se levanta solo.")
        elif not checks["daemon"]:
            txt = ("Docker está instalado pero el servicio (Docker Desktop) no está\n"
                   "corriendo. Abrilo y esperá a que termine de iniciar.")
        else:
            txt = ("Docker Compose v2 no está disponible. Actualizá Docker Desktop, o en\n"
                   "Linux instalá el plugin: sudo apt-get install docker-compose-plugin")
        tk.Label(msg, text=txt, bg=BG, fg=MUTED, font=("Courier New", 9),
                 justify="left", anchor="w").pack(fill="x")

        btn_row = tk.Frame(body, bg=BG)
        btn_row.pack(fill="x", pady=(6, 0))
        if not checks["docker"]:
            url = DOCKER_DOWNLOAD_URL.get(platform.system(), DOCKER_DOWNLOAD_URL["Linux"])
            self._btn(btn_row, "⬇  Descargar Docker", BLUE, "white",
                      lambda: webbrowser.open(url)).pack(side="left", padx=(0, 10))
        self._btn(btn_row, "↻  Verificar de nuevo", SURFACE, TEXT,
                  lambda: self._show_setup_or_dashboard()).pack(side="left")

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------

    def _build_ui(self):
        for w in self.winfo_children():
            w.destroy()

        # Header
        hdr = tk.Frame(self, bg=BG, padx=20, pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Security Lab Launcher",
                 bg=BG, fg=CYAN, font=("Courier New", 15, "bold")).pack(side="left")

        sep = tk.Frame(self, bg=BORDER, height=1)
        sep.pack(fill="x", padx=20)

        # Body
        body = tk.Frame(self, bg=BG, padx=16, pady=14)
        body.pack(fill="both", expand=True)

        # Left panel (fixed width)
        left = tk.Frame(body, bg=BG, width=240)
        left.pack(side="left", fill="y", padx=(0, 14))
        left.pack_propagate(False)

        self._build_status(left)
        tk.Frame(left, bg=BG, height=10).pack()
        self._build_actions(left)
        tk.Frame(left, bg=BG, height=10).pack()
        self._build_n8n_config(left)
        tk.Frame(left, bg=BG, height=10).pack()
        self._build_links(left)

        # Right panel: log
        self._build_log(body)

    # ---- Status -------------------------------------------------------

    def _build_status(self, parent):
        card = self._card(parent, "ESTADO")
        self._dot = {}
        self._status_lbl = {}
        for key, name in [("n8n", "n8n"), ("openvas", "OpenVAS"), ("mailpit", "Mailpit")]:
            row = tk.Frame(card, bg=SURFACE)
            row.pack(fill="x", padx=12, pady=3)
            dot = tk.Label(row, text="●", bg=SURFACE, fg=RED, font=("Courier New", 11))
            dot.pack(side="left")
            tk.Label(row, text=f"  {name}", bg=SURFACE, fg=TEXT,
                     font=("Courier New", 9), width=9, anchor="w").pack(side="left")
            lbl = tk.Label(row, text="stopped", bg=SURFACE, fg=MUTED,
                           font=("Courier New", 8))
            lbl.pack(side="right")
            self._dot[key] = dot
            self._status_lbl[key] = lbl
        tk.Frame(card, bg=SURFACE, height=6).pack()

    # ---- Actions -------------------------------------------------------

    def _build_actions(self, parent):
        card = self._card(parent, "ACCIONES")
        inner = tk.Frame(card, bg=SURFACE, padx=12, pady=8)
        inner.pack(fill="x")

        self.btn_start = self._btn(inner, "▶  Iniciar Lab", GREEN, BLACK,
                                   lambda: self._run(self._do_start))
        self.btn_start.pack(fill="x", pady=(0, 6))

        stop_row = tk.Frame(inner, bg=SURFACE)
        stop_row.pack(fill="x", pady=(0, 6))
        self.btn_stop = self._btn(stop_row, "■  Detener Lab", RED, "white",
                                  lambda: self._run(self._do_stop))
        self.btn_stop.pack(side="left", fill="x", expand=True)
        self._del_vol = tk.BooleanVar()
        tk.Checkbutton(stop_row, text=" Reset\n datos", variable=self._del_vol,
                       bg=SURFACE, fg=MUTED, selectcolor=BG, activebackground=SURFACE,
                       font=("Courier New", 7)).pack(side="left", padx=(6, 0))

        tk.Label(inner, text="Laboratorio: 172.20.0.0/24 (fijo)", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 8), anchor="w").pack(fill="x", pady=(0, 6))

        tk.Label(inner, text="Perfil de escaneo:", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 8), anchor="w").pack(fill="x")
        self._profile = tk.StringVar(value=list(SCAN_PROFILES.keys())[1])
        om = tk.OptionMenu(inner, self._profile, *SCAN_PROFILES.keys())
        om.configure(bg=BG, fg=CYAN, font=("Courier New", 8), relief="flat",
                     activebackground=BORDER, activeforeground=TEXT,
                     highlightthickness=1, bd=0)
        om["menu"].configure(bg=SURFACE, fg=TEXT, font=("Courier New", 8),
                             activebackground=BORDER, activeforeground=CYAN)
        om.pack(fill="x", pady=(2, 8))

        self.btn_scan = self._btn(inner, "⚡  Escanear laboratorio", BLUE, "white",
                                  lambda: self._run(self._do_scan))
        self.btn_scan.pack(fill="x")

        self._btn(inner, "🔍  Diagnóstico n8n", SURFACE, MUTED,
                  lambda: self._run(self._do_diagnostico)).pack(fill="x", pady=(4, 0))

    # ---- N8N Config ---------------------------------------------------

    def _build_n8n_config(self, parent):
        card = self._card(parent, "CONFIG N8N")
        inner = tk.Frame(card, bg=SURFACE, padx=12, pady=8)
        inner.pack(fill="x")

        tk.Label(inner, text="Email:", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 8), anchor="w").pack(fill="x")
        tk.Entry(inner, textvariable=self._n8n_email, bg=BG, fg=TEXT,
                 font=("Courier New", 9), insertbackground=TEXT,
                 relief="flat", bd=5).pack(fill="x", pady=(2, 6))

        tk.Label(inner, text="Password:", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 8), anchor="w").pack(fill="x")
        tk.Entry(inner, textvariable=self._n8n_password, show="*",
                 bg=BG, fg=TEXT, font=("Courier New", 9),
                 insertbackground=TEXT, relief="flat", bd=5).pack(fill="x", pady=(2, 6))

        tk.Checkbutton(inner, text=" Scan diario automatico (5am)",
                       variable=self._daily_scan,
                       bg=SURFACE, fg=MUTED, selectcolor=BG,
                       activebackground=SURFACE,
                       font=("Courier New", 8)).pack(anchor="w")
        tk.Label(inner, text="(requiere workflow V3 importado)",
                 bg=SURFACE, fg=MUTED,
                 font=("Courier New", 7)).pack(anchor="w")
        tk.Frame(card, bg=SURFACE, height=4).pack()

    # ---- Links --------------------------------------------------------

    def _build_links(self, parent):
        card = self._card(parent, "ABRIR EN BROWSER")
        inner = tk.Frame(card, bg=SURFACE, padx=12, pady=6)
        inner.pack(fill="x")
        for label, url in [
            ("n8n  → :5678", "http://localhost:5678"),
            ("OpenVAS → :9392", "http://127.0.0.1:9392"),
            ("Mailpit → :8025", "http://localhost:8025"),
        ]:
            tk.Button(inner, text=label, bg=SURFACE, fg=CYAN,
                      font=("Courier New", 9), relief="flat", anchor="w",
                      cursor="hand2", activeforeground=TEXT, activebackground=SURFACE,
                      command=lambda u=url: webbrowser.open(u)).pack(fill="x", pady=1)
        tk.Frame(card, bg=SURFACE, height=4).pack()

    # ---- Log ----------------------------------------------------------

    def _build_log(self, parent):
        frame = tk.Frame(parent, bg=SURFACE, bd=1, relief="solid")
        frame.pack(side="left", fill="both", expand=True)

        hdr = tk.Frame(frame, bg=SURFACE, padx=12, pady=7)
        hdr.pack(fill="x")
        tk.Label(hdr, text="LOG DE ACTIVIDAD", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 7)).pack(side="left")
        tk.Button(hdr, text="Limpiar", bg=SURFACE, fg=MUTED, relief="flat",
                  font=("Courier New", 8), cursor="hand2",
                  command=self._clear_log).pack(side="right")

        self._log_widget = tk.Text(
            frame, bg=BLACK, fg=TEXT, font=("Courier New", 8),
            insertbackground=TEXT, relief="flat", wrap="word",
            padx=10, pady=8, state="disabled"
        )
        sb = tk.Scrollbar(frame, command=self._log_widget.yview, bg=SURFACE)
        self._log_widget.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self._log_widget.pack(fill="both", expand=True)

        for tag, color in [("info", TEXT), ("success", GREEN), ("error", RED),
                            ("warn", YELLOW), ("wait", MUTED), ("done", CYAN)]:
            self._log_widget.tag_config(tag, foreground=color)

        self._append("Dashboard listo. Usá los botones para controlar el lab.", "wait")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _card(self, parent, title):
        frame = tk.Frame(parent, bg=SURFACE, bd=1, relief="solid")
        frame.pack(fill="x", pady=(0, 0))
        tk.Label(frame, text=title, bg=SURFACE, fg=MUTED,
                 font=("Courier New", 7), pady=7, padx=12, anchor="w").pack(fill="x")
        return frame

    def _btn(self, parent, text, bg, fg, command):
        return tk.Button(parent, text=text, bg=bg, fg=fg,
                         font=("Courier New", 10, "bold"), relief="flat",
                         padx=10, pady=7, cursor="hand2",
                         activebackground=bg, activeforeground=fg,
                         command=command)

    # ------------------------------------------------------------------
    # Queue / log
    # ------------------------------------------------------------------

    def _poll_queue(self):
        while True:
            try:
                msg = self._q.get_nowait()
                self._append(msg["text"], msg["tag"])
            except queue.Empty:
                break
        self.after(80, self._poll_queue)

    def _log(self, text, tag="info"):
        self._q.put({"text": text, "tag": tag})

    def _append(self, text, tag="info"):
        self._log_widget.config(state="normal")
        self._log_widget.insert("end", f"> {text}\n", tag)
        self._log_widget.see("end")
        self._log_widget.config(state="disabled")

    def _clear_log(self):
        self._log_widget.config(state="normal")
        self._log_widget.delete("1.0", "end")
        self._log_widget.config(state="disabled")

    # ------------------------------------------------------------------
    # Threading
    # ------------------------------------------------------------------

    def _set_buttons(self, enabled):
        state = "normal" if enabled else "disabled"
        for btn in [self.btn_start, self.btn_stop, self.btn_scan]:
            btn.config(state=state)

    def _run(self, fn):
        if self._busy:
            return
        self._busy = True
        self._set_buttons(False)

        def wrapper():
            try:
                fn()
            finally:
                self._busy = False
                self.after(0, lambda: self._set_buttons(True))
                self.after(0, self._update_status)

        threading.Thread(target=wrapper, daemon=True).start()

    # ------------------------------------------------------------------
    # Status polling
    # ------------------------------------------------------------------

    def _schedule_status(self):
        self._update_status()
        self.after(5000, self._schedule_status)

    def _update_status(self):
        def _check():
            pairs = [
                ("n8n",     "n8n-security-lab"),
                ("openvas", "greenbone-community-edition-gvmd-1"),
                ("mailpit", "mailpit"),
            ]
            for key, name in pairs:
                try:
                    r = subprocess.run(
                        ["docker", "inspect", "--format", "{{.State.Status}}", name],
                        capture_output=True, text=True
                    )
                    status = r.stdout.strip() if r.returncode == 0 else "stopped"
                except Exception:
                    status = "error"
                running = status == "running"
                color = GREEN if running else RED
                self.after(0, lambda k=key, s=status, c=color: (
                    self._dot[k].config(fg=c),
                    self._status_lbl[k].config(text=s)
                ))

        threading.Thread(target=_check, daemon=True).start()

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _stream(self, cmd, cwd=None):
        proc = subprocess.Popen(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
        )
        for line in proc.stdout:
            line = line.strip()
            if line:
                self._log(line)
        proc.wait()
        return proc.returncode

    def _do_start(self):
        self._log("--- Iniciando laboratorio ---", "done")
        self._log("Levantando el stack con docker compose...", "info")

        rc = self._stream(
            ["docker", "compose", "up", "-d", "--build"],
            cwd=SCRIPT_DIR
        )
        if rc != 0:
            self._log("ERROR: docker compose falló. Revisá Docker.", "error")
            return

        self._log("Esperando a que OpenVAS levante el socket...", "info")
        for i in range(60):
            r = subprocess.run(
                ["docker", "exec", GVMD_CONTAINER, "ls", "/run/gvmd/gvmd.sock"],
                capture_output=True
            )
            if r.returncode == 0:
                break
            self._log(f"  Esperando... ({i * 5}s / 300s máx)", "wait")
            time.sleep(5)
        else:
            self._log("TIMEOUT: OpenVAS no levantó el socket en 5 minutos.", "error")
            return

        self._log("OpenVAS listo. Esperando 10s para que gvmd esté disponible...", "success")
        time.sleep(10)

        self._log("Configurando usuario admin...", "info")
        rc = subprocess.run(
            ["docker", "exec", "-u", "1001", GVMD_CONTAINER,
             "gvmd", "--user=admin", "--new-password=admin123"],
            capture_output=True
        ).returncode

        if rc == 0:
            self._log("Password de admin actualizado a admin123.", "success")
        else:
            subprocess.run(
                ["docker", "exec", "-u", "1001", GVMD_CONTAINER,
                 "gvmd", "--create-user=admin", "--password=admin123"],
                capture_output=True
            )
            self._log("Usuario admin creado con password admin123.", "success")

        self._log("¡Laboratorio operativo!", "done")
        self._log("  n8n     → http://localhost:5678", "info")
        self._log("  OpenVAS → http://127.0.0.1:9392  (admin / admin123)", "info")
        self._log("  Mailpit → http://localhost:8025", "info")
        self._log("IMPORTANTE: la primera vez OpenVAS tarda 15-30 min en sincronizar feeds.", "warn")

        self._log("Activando workflow V3 automaticamente...", "info")
        time.sleep(3)
        self._try_activate_workflow()

    def _try_activate_workflow(self):
        """Login to n8n and activate the V3 workflow via internal REST API."""
        email = self._n8n_email.get().strip()
        password = self._n8n_password.get().strip()

        if not email or not password:
            self._log("  Credenciales n8n vacias — activa el workflow manualmente.", "warn")
            self._log("  Configura email/password en la seccion CONFIG N8N.", "info")
            return

        try:
            jar = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(
                urllib.request.HTTPCookieProcessor(jar)
            )

            # 1. Login
            body = json.dumps({"emailOrLdapLoginId": email, "password": password}).encode()
            req = urllib.request.Request(
                "http://localhost:5678/rest/login",
                data=body,
                headers={"Content-Type": "application/json",
                         "Accept": "application/json"},
            )
            resp = opener.open(req, timeout=10)
            login_data = json.loads(resp.read().decode())
            token = login_data.get("data", {}).get("token", "")
            auth = {"Authorization": f"Bearer {token}"} if token else {}

            # 2. Find the V3 workflow by name or webhook path
            req2 = urllib.request.Request(
                "http://localhost:5678/rest/workflows",
                headers={"Accept": "application/json", **auth},
            )
            raw = json.loads(opener.open(req2, timeout=10).read().decode())
            wf_list = raw.get("data", raw) if isinstance(raw, dict) else raw

            wf_id = None
            for wf in wf_list:
                name = wf.get("name", "")
                nodes_str = str(wf.get("nodes", ""))
                if "V3" in name or "linux" in name.lower() or "nmap-v3" in nodes_str:
                    wf_id = wf["id"]
                    break

            if not wf_id:
                self._log("  Workflow V3 no encontrado — importalo en n8n primero.", "warn")
                return

            # 3. Activate the workflow
            req3 = urllib.request.Request(
                f"http://localhost:5678/rest/workflows/{wf_id}/activate",
                data=b"",
                headers={"Accept": "application/json", **auth},
                method="POST",
            )
            opener.open(req3, timeout=10)

            if self._daily_scan.get():
                self._log("  Workflow V3 activado (webhook + scan diario 5am).", "success")
            else:
                self._log("  Workflow V3 activado (solo webhook).", "success")
            self._log("  Ya podes escanear sin abrir n8n manualmente.", "done")

        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 401:
                self._log("  Credenciales n8n incorrectas. Verifica email/password.", "error")
            else:
                self._log(f"  n8n API respondio HTTP {e.code}. Activa el workflow manualmente.", "warn")
        except Exception as e:
            self._log(f"  Auto-activacion fallo ({type(e).__name__}). Activa manualmente en n8n.", "warn")

    def _do_stop(self):
        delete = self._del_vol.get()
        self._log(f"--- Deteniendo laboratorio{' + reset de datos' if delete else ''} ---", "warn")

        cmd = ["docker", "compose", "down"]
        if delete:
            cmd.append("-v")

        rc = self._stream(cmd, cwd=SCRIPT_DIR)
        if rc == 0:
            if delete:
                self._log("Reset completo. Los feeds se volverán a descargar.", "done")
            else:
                self._log("Laboratorio detenido. Los datos persisten.", "done")
        else:
            self._log("Error al detener el laboratorio.", "error")

    def _do_diagnostico(self):
        self._log("--- Diagnóstico n8n ---", "info")

        # 1. n8n healthz
        try:
            urllib.request.urlopen("http://localhost:5678/healthz", timeout=5)
            self._log("  [OK] n8n responde en :5678", "success")
        except Exception as e:
            self._log(f"  [FAIL] n8n no responde: {e}", "error")
            self._log("  → El laboratorio no está corriendo.", "warn")
            return

        # 2. Webhook de producción
        wh_url = "http://localhost:5678/webhook-test/nmap-v3"
        try:
            req = urllib.request.Request(wh_url, data=b"", method="POST")
            with urllib.request.urlopen(req, timeout=5) as r:
                self._log(f"  [OK] Webhook responde: HTTP {r.status}", "success")
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 404:
                self._log(f"  [FAIL] Webhook-test /webhook-test/nmap-v3 → 404", "error")
                self._log(f"  Detalle: {body[:250]}", "warn")
                self._log("  → El workflow V3 no está activo en n8n.", "warn")
                self._log("  → Solución: http://localhost:5678 → abrí el workflow V3", "info")
                self._log("             → activalo con el toggle de la esquina superior derecha.", "info")
            else:
                self._log(f"  [INFO] Webhook respondió HTTP {e.code}: {body[:150]}", "warn")
        except Exception as e:
            self._log(f"  [FAIL] Error conectando al webhook: {e}", "error")

        # 3. Workflows activos via API pública (sin clave)
        try:
            req2 = urllib.request.Request("http://localhost:5678/api/v1/workflows",
                                          headers={"Accept": "application/json"})
            urllib.request.urlopen(req2, timeout=5)
            self._log("  [INFO] API /workflows accessible sin auth", "info")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self._log("  [INFO] API requiere API key (normal).", "info")
            else:
                self._log(f"  [INFO] API respondió HTTP {e.code}", "info")
        except Exception:
            pass

        self._log("Diagnóstico completo.", "done")

    def _wait_lab_targets_ready(self, timeout=60):
        """Espera a que los contenedores de lab-targets con healthcheck
        reporten 'healthy' antes de disparar el escaneo. Corrige la condición
        de carrera real detrás de que 172.20.0.10 nunca fuera detectado por
        Nmap en el experimento: el escaneo arrancaba antes de que web-10-http/
        web-10-https terminaran de levantar. Si lab-targets no está corriendo
        (compose file inexistente o sin containers), no bloquea: loguea un
        aviso y deja seguir, para no romper setups sin lab-targets.
        """
        if not os.path.exists(LAB_TARGETS_COMPOSE):
            return True

        self._log("Esperando a que lab-targets esté listo (healthchecks)...", "wait")
        elapsed = 0
        interval = 2
        while elapsed <= timeout:
            try:
                result = subprocess.run(
                    ["docker", "compose", "-f", LAB_TARGETS_COMPOSE, "ps", "--format", "json"],
                    capture_output=True, text=True, timeout=10
                )
            except Exception as e:
                self._log(f"  No se pudo consultar lab-targets: {e}", "warn")
                return True

            lines = [l for l in result.stdout.splitlines() if l.strip()]
            if not lines:
                self._log("  lab-targets no está corriendo, sigo sin esperar.", "warn")
                return True

            healths = []
            for line in lines:
                try:
                    healths.append(json.loads(line).get("Health", ""))
                except json.JSONDecodeError:
                    continue
            declared = [h for h in healths if h]  # ignora contenedores sin healthcheck

            if declared and all(h == "healthy" for h in declared):
                self._log("  lab-targets: todos los healthchecks OK.", "success")
                return True

            time.sleep(interval)
            elapsed += interval

        self._log(f"  TIMEOUT esperando lab-targets ({timeout}s). Sigo igual, pero .10 puede fallar.", "warn")
        return False

    def _do_scan(self):
        # El nodo NmapScan corre DENTRO del contenedor de n8n (Linux, sea cual
        # sea el SO del host) y escanea la subred fija del laboratorio
        # (172.20.0.0/24, ver lab-targets/docker-compose.lab-targets.yml) —
        # por eso no hace falta pedir subred, y el mismo webhook funciona
        # igual en Windows y Linux.
        profile_name = self._profile.get()
        scan_config_uuid = SCAN_PROFILES[profile_name]
        self._log("--- Escaneo del laboratorio iniciado ---", "info")
        self._log(f"Perfil: {profile_name.strip()}", "info")

        self._wait_lab_targets_ready()

        try:
            urllib.request.urlopen("http://localhost:5678/healthz", timeout=5)
            self._log("  n8n: OK (healthz responde)", "success")
        except Exception as e:
            self._log(f"  n8n no responde al healthz: {e}", "error")
            self._log("  ¿El laboratorio está corriendo?", "warn")
            return

        url = f"http://localhost:5678/webhook/nmap-interno?scan_config={scan_config_uuid}"
        try:
            req = urllib.request.Request(url, data=b"", method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                self._log(f"Escaneo disparado (HTTP {resp.status}).", "done")
                self._log("Nmap corre adentro del contenedor de n8n contra 172.20.0.0/24.", "info")
                self._log("El análisis de Greenbone tardará según el perfil elegido.", "info")
                self._log("Revisá Telegram y Mailpit para los resultados.", "info")
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            self._log(f"HTTP {e.code} {e.reason}", "error")
            self._log(f"  Respuesta: {body[:200]}", "error")
            if e.code == 404:
                self._log("  El webhook 'nmap-interno' no existe en el workflow importado.", "warn")
                self._log("  Reimportá workflows/workflowV4_windows.json en n8n.", "warn")
        except Exception as e:
            self._log(f"Error de conexión: {type(e).__name__}: {e}", "error")


if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
