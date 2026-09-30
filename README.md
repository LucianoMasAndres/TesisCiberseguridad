# 🛡️ Automatización de Análisis de Vulnerabilidades (n8n + OpenVAS)

Este proyecto despliega un entorno de orquestación de seguridad automatizado usando **n8n** integrado con **Greenbone Community Edition (OpenVAS)**. El sistema descubre los activos de una red de laboratorio, los clasifica por criticidad, analiza en profundidad los de criticidad Alta o Crítica y notifica los resultados por **Telegram** y **email**.

Es el artefacto del Trabajo Final Integrador *"Sistema Automatizado de Gestión de Vulnerabilidades Orquestado con n8n"* (UTN FRM). Los datos y scripts del experimento de la tesis están en [`docs/`](#-reproducir-el-análisis-de-la-tesis).

## 🧱 Arquitectura

El flujo principal es `workflows/workflowV4_windows.json` (workflow `workflowV4_webhook`). Pese al nombre histórico, **no depende del sistema operativo del host**: Nmap, `gvm-cli` y el socket de gvmd corren dentro de los contenedores, y es el flujo que importan tanto `init_lab.sh` (Linux) como `init_lab.ps1` (Windows).

```
[Launcher GUI / Manual Trigger]  ← dispara /webhook/nmap-interno
      │
      ▼
 [NmapScan]  ← dentro del contenedor de n8n: descubrimiento (-sn) sobre
      │        172.20.0.0/24 + escaneo de puertos catalogados (TCP y 161/udp)
      ▼
   [Code]  ← classifyAsset(): puntaje por puertos → Normal / Alto / Crítico
      │      (excluye .1, .2 y .3, infraestructura de la red lab-net)
      │
      ├── Sin activos Alto/Crítico → [Telegram: "Red limpia"]
      │
      └── Alto/Crítico ↓           (los Normal no pasan a Greenbone, por diseño)
            │
   [CreateTarget → CreateTask → StartTask]  ← GMP por socket Unix
            │
       [PollStatus]  ← cada 60 s, máximo 90 min → rama de timeout con aviso
            │
       [Reporte]  ← descarga y parsea el XML de resultados
            │
            ├── [Telegram]  ← resumen con severidades
            └── [Email]     ← reporte HTML completo (vía Mailpit)
```

El flujo tiene un segundo punto de entrada, `/webhook/nmap`, que recibe por POST un JSON con los hosts y sus puertos ya escaneados y entra directo al nodo `Code`. Es el que usa `docs/run_experiment.js` para medir la campaña de la tesis (ver [`docs/evidencia_campana_gvm/`](docs/evidencia_campana_gvm/README.md)).

**Servicios incluidos:**
- `n8n` — Orquestador de workflows (puerto 5678), con Nmap y `gvm-tools` (`n8n_custom/Dockerfile`)

> Red: `lab-net` y `greenbone-net` son redes bridge con salida a Internet (n8n la necesita para Telegram; Greenbone, para los feeds). GSA (9392) y Mailpit (8025/1025) se publican solo en 127.0.0.1. n8n (5678) se publica en todas las interfaces, sin autenticación, para que la app móvil pueda alcanzarlo desde la LAN: no exponer el equipo a redes no confiables.
- `Greenbone/OpenVAS` — Motor de escaneo de vulnerabilidades (imágenes de `registry.community.greenbone.net`)
- `GSA` — Interfaz web de OpenVAS (puerto 9392)
- `Mailpit` — Servidor SMTP de prueba para emails (puerto 8025)
- `lab-targets` — Laboratorio de 12 activos en `172.20.0.10-21` (`lab-targets/docker-compose.lab-targets.yml`, ver `docs/anexo_e_f_v2.md`)

---

## 📋 Requisitos

### Hardware y sistema

- **RAM:** mínimo 4GB (recomendado 8GB)
- **Disco:** mínimo 20GB libres (las imágenes de Greenbone son pesadas)
- Acceso a internet para descargar imágenes y feeds de vulnerabilidades

| Sistema operativo | Estado | Notas |
|---|---|---|
| Windows 11 + Docker Desktop | ✅ Verificado | Entorno de la campaña de la tesis y de la remedición manual |
| Linux (Ubuntu 20.04+) | ✅ Soportado | `init_lab.sh` levanta el mismo stack e importa el mismo workflow (V4) |
| macOS / Windows 10 | ⚠️ No probado | El flujo corre dentro de Docker, pero no se verificó en estos sistemas |

### Dependencias del host

Todo lo demás (OpenVAS, n8n, Nmap, Mailpit, PostgreSQL, Redis, etc.) son imágenes Docker que se descargan solas la primera vez.

| Dependencia | Para qué | Instalación |
|---|---|---|
| **Docker** >= 24.0 | Correr los contenedores | Ver abajo |
| **Docker Compose** v2 | Orquestar el stack | Viene incluido con Docker moderno |
| **Usuario en grupo docker** (Linux) | Que el launcher pueda correr Docker sin sudo | `sudo usermod -aG docker $USER` + cerrar sesión y volver a entrar |
| **Python 3** + **tkinter** | Correr el launcher GUI | Linux: `sudo apt install python3-tk` · Windows: python.org con "tcl/tk" |
| **Node.js** *(opcional)* | Correr los scripts de análisis y los tests de `docs/` | nodejs.org |

`scripts/init_lab.sh` verifica que Docker y Docker Compose v2 estén instalados y que el demonio responda antes de empezar.

### Instalar Docker en Linux
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Instalar Docker en Windows
Instalá [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/).

---

## ⚙️ Configuración previa (OBLIGATORIO antes de ejecutar)

### 1. Token y Chat ID de Telegram
Creá un bot con [@BotFather](https://t.me/BotFather) en Telegram:
1. Escribile `/newbot` y seguí los pasos
2. Guardá el **token** que te da (formato: `123456789:AAFxxx...`)
3. Escribile cualquier mensaje a tu bot
4. Abrí en el browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Buscá `"chat":{"id": XXXXXXX}` — ese es tu **Chat ID**

Los nodos de Telegram de V4 son nodos **Code** que llaman a la API con `curl` (el sandbox de n8n bloquea el módulo `https` y las variables de entorno). Después de importar el workflow, en cada uno de los cuatro nodos (`Telegram Scan Iniciado`, `Telegram Red Limpia`, `Telegram Scan Timeout` y `Send a text message1`):
- reemplazá `TU_TELEGRAM_BOT_TOKEN_AQUI` por tu token;
- reemplazá el Chat ID del llamado a `sendTelegram(...)` por el tuyo.

### 2. Red a escanear
La subred está fija en el nodo **NmapScan**: `172.20.0.0/24`, la red `lab-net` del laboratorio. El launcher no pide subred. Las IPs de infraestructura que se excluyen (`.1`, `.2`, `.3`) están en el nodo **Code**.

### 3. Email
En el nodo **Send Email**, reemplazá `TU_EMAIL_AQUI` por el destinatario. Mailpit intercepta todos los emails localmente en `http://127.0.0.1:8025` sin configurar nada más (la credencial SMTP es `Mailpit SMTP`).

---

## 🚀 Instalación y primer uso

### 1. Clonar el proyecto
```bash
git clone https://github.com/LucianoMasAndres/TesisCiberseguridad.git
cd TesisCiberseguridad
```

### 2. Instalar el launcher en el escritorio

**Linux:**
```bash
bash scripts/install_launcher.sh
```
Crea un ícono **Security Lab** en el escritorio de GNOME.

**Windows:**
```powershell
scripts\install_launcher.bat
```
Crea un acceso directo **SecurityLab.lnk** en el escritorio. Requiere Python 3 instalado desde [python.org](https://www.python.org/downloads/) con la opción **"Add Python to PATH"** marcada.

En ambos casos también podés correrlo directamente desde la terminal:
```bash
python3 launcher.py   # Linux
python launcher.py    # Windows
```

### 3. Workflows

| Archivo | Estado | Descripción |
|---|---|---|
| `workflows/workflowV4_windows.json` | **Principal** (todos los sistemas) | Descubrimiento + escaneo de puertos, clasificación por criticidad, Greenbone sobre Alto/Crítico, timeout. Lo importan `init_lab.sh` e `init_lab.ps1` |
| `workflows/workflowV3_linux.json` | Histórico | Versión anterior: solo descubrimiento (`nmap -sn`), sin clasificación (manda a Greenbone todos los hosts activos), sin timeout, subred por defecto `192.168.122.0/24`. Se conserva porque lo usa el prototipo de app móvil (`app_celular/`); hay que importarlo a mano |

Si importás el workflow manualmente: `http://localhost:5678` → **Workflows** → **"..."** → **Import from file** → `workflowV4_windows.json`, y configurá Telegram y email (sección anterior).

> ⚠️ Este paso solo hace falta la primera vez. Los datos persisten en un volumen Docker.

---

## ▶️ Ejecutar el laboratorio y hacer un escaneo

### Con el launcher GUI (recomendado)

1. Abrí **Security Lab** desde el escritorio (o `python3 launcher.py`)
2. En la sección **CONFIG N8N** ingresá el email y password que configuraste la primera vez que entraste a `http://localhost:5678`
3. Hacé clic en **Iniciar Lab** y esperá a que diga "¡Laboratorio operativo!". El launcher activa el workflow V4
4. Elegí el perfil de escaneo y hacé clic en **Escanear laboratorio** (la subred es fija, `172.20.0.0/24`)
5. Revisá Telegram para el resumen y `http://127.0.0.1:8025` para el reporte completo

**Perfiles de escaneo disponibles:**

| Perfil | Velocidad | Profundidad |
|---|---|---|
| Rápido — Solo descubrimiento | ~5 min | Solo descubre hosts |
| Normal — Full & Fast | ~30 min | Escaneo completo balanceado |

"Full and very deep" y "Full and very deep ultimate" no se ofrecen: pertenecen al Greenbone Enterprise Feed y no existen en la Community Edition que usa este laboratorio.

> ⚠️ La primera vez que levantás el lab, OpenVAS tarda **15-30 minutos** en sincronizar los feeds de vulnerabilidades. Si el workflow falla con `404 scan config not found`, esperá y reintentá.

### Sin el launcher (alternativa por consola)

**Linux:**
```bash
bash scripts/init_lab.sh
```
**Windows 11** (PowerShell como Administrador):
```powershell
.\scripts\init_lab.ps1
```
Ambos levantan primero `lab-targets/docker-compose.lab-targets.yml` (crea la red externa `lab-net`, de la que depende el stack principal), después `docker compose up -d --build`, esperan el socket de gvmd, configuran el usuario `admin` e importan workflowV4. Para disparar un escaneo sin launcher: `POST http://localhost:5678/webhook/nmap-interno?scan_config=<id de perfil>` con el workflow activo.

`scripts/scan.sh` y `scripts/scan.ps1` son **históricos** (escaneo externo desde el host, del diseño original) y no alimentan el flujo actual; ver su encabezado.

---

## 🛑 Apagar el laboratorio

Desde el launcher: botón **Detener Lab**.

O por consola:
```bash
docker compose down
```

Para borrar todos los datos y empezar de cero (⚠️ irreversible):
```bash
docker compose down -v
```

---

## 🔬 Reproducir el análisis de la tesis

Todos los scripts resuelven sus rutas respecto de su propia ubicación, así que corren desde cualquier directorio. Los de análisis no necesitan el laboratorio levantado.

| Comando | Qué hace |
|---|---|
| `node docs/analyze_results.js` | Recalcula las cifras del brazo automatizado desde `docs/experiment_results.jsonl`; la salida es idéntica a `docs/analysis_output.txt` |
| `node docs/analyze_manual_arm.js` | Lista las repeticiones del brazo manual (`docs/manual_arm_results.jsonl`) por operador; no promedia operadores con condiciones distintas |
| `node docs/test_classify.js` | Verifica `classifyAsset` contra el ground truth del Anexo F (12/12) |
| `node docs/test_nmap_parsing.js` | Verifica el parseo de XML de Nmap (NmapScan de V4 y `run_experiment.js`) con salidas reales capturadas del laboratorio (`docs/fixtures/`) |
| `node docs/test_workflow_contract.js` | Verifica que el webhook que usa `run_experiment.js` exista en V4 y entre por la clasificación, y que los workflows no tengan conexiones o referencias rotas |
| `node docs/test_scripts_cwd.js` | Verifica que los scripts de análisis corran desde cualquier directorio y reproduzcan `analysis_output.txt` |
| `docker exec -u node n8n-security-lab node /tmp/test_e2e_pipeline.js` | E2E real contra el laboratorio: ejecuta NmapScan + Code tal como están en V4 (ver el encabezado del archivo para copiarlo al contenedor) |

Evidencia cruda:
- `docs/experiment_results.jsonl`, `docs/experiment_log.txt`: campaña automatizada del 14/08/2026 (5 repeticiones). Qué se ejecutó exactamente, en `docs/evidencia_campana_gvm/`.
- `docs/manual_arm_results.jsonl`: remedición del brazo manual (n=2), con la evidencia de cada operador en `docs/evidencia_manual_operador1/` y `docs/evidencia_manual_operador2/`.
- `docs/evidencia_control_hw/`: corridas de control manuales del 20/08/2026.

### Limitaciones conocidas del artefacto

- **Greenbone no sondea UDP.** `CreateTarget` usa la lista de puertos `All IANA assigned TCP`. Nmap sí detecta SNMP (161/udp) y lo usa para clasificar, pero Greenbone no puede evaluar la vulnerabilidad de SNMP del activo .17. Se mantuvo así porque es la configuración con la que se midió la campaña; una lista TCP+UDP alargaría mucho el escaneo y cambiaría lo medido.
- **Campo `cve` vacío en el dataset de la campaña.** La extracción de CVE por `<refs>` se corrigió después; los 108 hallazgos de `experiment_results.jsonl` tienen el campo vacío (el CVE, cuando existe, figura en el nombre del hallazgo).
- **El nodo NmapScan no se ejercitó en la campaña**: el descubrimiento medido lo hizo `run_experiment.js` con los mismos comandos de Nmap. NmapScan está cubierto por `test_nmap_parsing.js` y por el E2E real.
- **Restart policies.** Los servicios persistentes de Greenbone usan `restart: unless-stopped` (el compose de referencia usa `on-failure`, con el que `pg-gvm` u `ospd-openvas` pueden no volver tras reiniciar Docker). Si igual ves `gvmd` como `unhealthy`: `docker compose up -d`.

---

## 🗂️ Estructura del proyecto

```
TesisCiberseguridad/
├── docker-compose.yml             # Stack principal (n8n + Greenbone + Mailpit)
├── launcher.py                    # App GUI de escritorio (Linux y Windows)
├── n8n_custom/Dockerfile          # Imagen n8n con Nmap (setuid) + gvm-tools
├── lab-targets/                   # Laboratorio de 12 activos (crea la red externa lab-net)
├── scripts/
│   ├── init_lab.sh / init_lab.ps1 # Inicio completo: lab-targets + stack + import de V4
│   ├── stop_lab.sh / stop_lab.ps1 # Apagado
│   ├── wait_lab_targets_ready.sh  # Espera los healthchecks de lab-targets
│   ├── install_launcher.*         # Acceso directo del launcher
│   ├── build_launcher_windows.bat # Empaquetado del launcher (Windows)
│   ├── scan.sh / scan.ps1         # Históricos: escaneo externo desde el host
│   └── install_nmap.*             # Históricos: Nmap en el host (solo para scan.*)
├── workflows/
│   ├── workflowV4_windows.json    # Principal (todos los sistemas)
│   └── workflowV3_linux.json      # Histórico (lo usa app_celular/)
├── app_celular/                   # Prototipo (MVP) de app móvil que dispara un escaneo
└── docs/                          # Experimento de la tesis: scripts, datos crudos,
                                   # evidencia, figuras, tests y anexo_e_f_v2.md
```

---

## 🔧 Troubleshooting

| Problema | Solución |
|---|---|
| `permission denied` al correr el launcher | Agregá tu usuario al grupo docker: `sudo usermod -aG docker $USER` y cerrá sesión |
| El launcher no abre (Linux) | Instalá tkinter: `sudo apt install python3-tk` |
| El launcher no abre (Windows) | Instalá Python desde python.org marcando "Add to PATH" y "tcl/tk and IDLE" |
| `404: Failed to find config` en el workflow | Los feeds de OpenVAS no terminaron. Esperá 15 min y reintentá |
| Webhook 404 al escanear | Verificá email/password de n8n en CONFIG N8N y que el launcher diga "Workflow V4 activado" al iniciar |
| `chat not found` en Telegram | El Chat ID es incorrecto. Obtenelo con `/getUpdates` |
| `Unauthorized` en Telegram | El token es incorrecto o fue revocado. Generá uno nuevo con BotFather |
| `gvmd` en estado `unhealthy` | Casi siempre `pg-gvm` no está corriendo: `docker compose up -d` |
| Greenbone termina en segundos sin hallazgos | `ospd-openvas` caído o sin ruta a `lab-net`: `docker compose up -d` y ver `docs/anexo_e_f_v2.md` |
| OpenVAS no levanta el socket | Revisá logs: `docker logs greenbone-community-edition-gvmd-1` |
| GSA no carga en el browser | Usá `http://127.0.0.1:9392` (no localhost, no HTTPS) |
| En Windows el script no corre | Abrí PowerShell como Administrador y ejecutá `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |

## Licencia

El código de este repositorio se distribuye bajo licencia MIT (ver `LICENSE`). Las herramientas que el laboratorio descarga como imágenes (n8n, Greenbone Community Edition, Nmap) conservan sus propias licencias.
