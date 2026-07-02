#!/usr/bin/env python3
"""
Security Lab Launcher — GUI standalone para controlar el laboratorio.
Corre en el host, sin necesitar Docker previamente levantado.
Requiere: python3-tk, docker, docker compose v2
"""
import os
import json
import queue
import subprocess
import threading
import time
import urllib.request
import urllib.error
import http.cookiejar
import platform
import webbrowser
import xml.etree.ElementTree as ET
import tkinter as tk

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GVMD_CONTAINER = "greenbone-community-edition-gvmd-1"
IS_LINUX = platform.system() == "Linux"

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

        self._build_ui()
        self._poll_queue()
        self._schedule_status()

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------

    def _build_ui(self):
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

        tk.Label(inner, text="Subred a escanear:", bg=SURFACE, fg=MUTED,
                 font=("Courier New", 8), anchor="w").pack(fill="x")
        self._subnet = tk.StringVar(value="192.168.1.0/24")
        tk.Entry(inner, textvariable=self._subnet, bg=BG, fg=TEXT,
                 font=("Courier New", 9), insertbackground=TEXT,
                 relief="flat", bd=5).pack(fill="x", pady=(2, 6))

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

        self.btn_scan = self._btn(inner, "⚡  Escanear red", BLUE, "white",
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

    def _do_scan(self):
        subnet = self._subnet.get().strip()
        if not subnet:
            self._log("Ingresá una subred válida (ej: 192.168.1.0/24).", "error")
            return

        profile_name = self._profile.get()
        scan_config_uuid = SCAN_PROFILES[profile_name]
        self._log(f"--- Escaneo iniciado: {subnet} ---", "info")
        self._log(f"Perfil: {profile_name.strip()}", "info")

        if IS_LINUX:
            self._log("Modo interno: n8n corre nmap dentro del container...", "info")
            url = f"http://localhost:5678/webhook/nmap-v3?scan_config={scan_config_uuid}&subnet={subnet}"
            self._log(f"  → URL: {url}", "wait")

            # Verificar que n8n responde antes de enviar
            try:
                urllib.request.urlopen("http://localhost:5678/healthz", timeout=5)
                self._log("  n8n: OK (healthz responde)", "success")
            except Exception as e:
                self._log(f"  n8n no responde al healthz: {e}", "error")
                self._log("  ¿El laboratorio está corriendo?", "warn")
                return

            try:
                req = urllib.request.Request(url, data=b"", method="POST")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    self._log(f"Workflow V3 disparado (HTTP {resp.status}).", "done")
                    self._log("El escaneo OpenVAS tardará según el perfil elegido.", "info")
                    self._log("Revisá Telegram y Mailpit para los resultados.", "info")
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")
                self._log(f"HTTP {e.code} {e.reason}", "error")
                self._log(f"  Respuesta: {body[:200]}", "error")
                if e.code == 404:
                    self._log("  El webhook-test no responde.", "warn")
                    self._log("  Abrí el workflow V3 en n8n y clickeá 'Listen for test event'.", "warn")
            except Exception as e:
                self._log(f"Error de conexión: {type(e).__name__}: {e}", "error")
        else:
            # V4: nmap corre en el host, enviamos el XML
            nmap_check = "where" if platform.system() == "Windows" else "which"
            if subprocess.run([nmap_check, "nmap"], capture_output=True).returncode != 0:
                self._log("nmap no está instalado.", "error")
                if platform.system() == "Windows":
                    self._log("Corré: scripts\\install_nmap.bat", "warn")
                else:
                    self._log("Corré: sudo ./scripts/install_nmap.sh", "warn")
                return
            self._log("Modo externo: corriendo nmap en el host...", "info")
            result = subprocess.run(
                ["nmap", "-sn", "-n", "-oX", "-", subnet],
                capture_output=True
            )
            if result.returncode != 0:
                self._log(f"Error en nmap: {result.stderr.decode()}", "error")
                return
            self._log("Nmap completado. Parseando hosts activos...", "info")
            try:
                root = ET.fromstring(result.stdout)
                hosts = []
                for host in root.findall("host"):
                    status = host.find("status")
                    if status is None or status.get("state") != "up":
                        continue
                    addr = host.find("address[@addrtype='ipv4']")
                    if addr is not None:
                        hosts.append(addr.get("addr"))
            except ET.ParseError as e:
                self._log(f"Error parseando XML de nmap: {e}", "error")
                return
            self._log(f"  {len(hosts)} host(s) activo(s): {', '.join(hosts) if hosts else '(ninguno)'}", "info")
            self._log("Enviando resultados a n8n...", "info")
            try:
                url = f"http://localhost:5678/webhook/nmap?scan_config={scan_config_uuid}"
                body = json.dumps({"hosts": hosts}).encode()
                req = urllib.request.Request(
                    url, data=body,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    self._log(f"Enviado a n8n (HTTP {resp.status}).", "done")
                    self._log("El escaneo OpenVAS tardará según el perfil elegido.", "info")
                    self._log("Revisá Telegram y Mailpit para los resultados.", "info")
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")
                self._log(f"HTTP {e.code} {e.reason}", "error")
                self._log(f"  Respuesta: {body[:200]}", "error")
                if e.code == 404:
                    self._log("  Abrí el workflow V4 en n8n y clickeá 'Listen for test event'.", "warn")
            except Exception as e:
                self._log(f"Error al enviar a n8n: {e}", "error")


if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
