# 🛡️ Automatización de Análisis de Vulnerabilidades (n8n + OpenVAS)

Este proyecto despliega un entorno de orquestación de seguridad completamente automatizado usando **n8n** integrado con **Greenbone Community Edition (OpenVAS)**. El sistema realiza escaneos de red, detecta vulnerabilidades y notifica los resultados por **Telegram** y **email**.

## 🧱 Arquitectura

```
[Launcher GUI]  ← App de escritorio para controlar todo
      │
      ▼
[Webhook n8n]  ← Recibe subred + perfil de escaneo
      │
      ▼
   [Nmap]  ← Descubre hosts activos en la red
      │
      ▼
  [Filtro]  ← Excluye IPs ignoradas (router, host, etc.)
      │
      ├── Sin hosts → [Telegram: "Red limpia"]
      │
      └── Con hosts ↓
            │
       [OpenVAS]  ← Crea Target + Task + inicia escaneo
            │
         [Poll]  ← Espera hasta que el escaneo termina
            │
       [Reporte]  ← Descarga y parsea resultados XML
            │
            ├── [Telegram]  ← Resumen con severidades
            └── [Email]     ← Reporte HTML completo (via Mailpit)
```

**Servicios incluidos:**
- `n8n` — Orquestador de workflows (puerto 5678)
- `Greenbone/OpenVAS` — Motor de escaneo de vulnerabilidades
- `GSA` — Interfaz web de OpenVAS (puerto 9392)
- `Mailpit` — Servidor SMTP de prueba para emails (puerto 8025)

---

## 📋 Requisitos

### Hardware y sistema

- **RAM:** mínimo 4GB (recomendado 8GB)
- **Disco:** mínimo 20GB libres (las imágenes de Greenbone son pesadas)
- Acceso a internet para descargar imágenes y feeds de vulnerabilidades

| Sistema operativo | Soporte | Notas |
|---|---|---|
| Linux (Ubuntu 20.04+) | ✅ Completo | Entorno recomendado |
| Windows 11 | ⚠️ Parcial | Requiere configuración extra (ver abajo) |
| Windows 10 | ❌ No soportado | Limitación de red de Docker Desktop |
| macOS | ❌ No soportado | Misma limitación que Windows 10 |

### Dependencias del host

Estas son las únicas cosas que hay que instalar en la máquina. Todo lo demás (OpenVAS, n8n, Mailpit, PostgreSQL, Redis, etc.) son imágenes Docker que se descargan solas la primera vez.

| Dependencia | Para qué | Instalación |
|---|---|---|
| **Docker** >= 24.0 | Correr los contenedores | Ver abajo |
| **Docker Compose** v2 | Orquestar el stack | Viene incluido con Docker moderno |
| **Usuario en grupo docker** | Que el launcher pueda correr Docker sin sudo | `sudo usermod -aG docker $USER` + cerrar sesión y volver a entrar |
| **Python 3** | Correr el launcher GUI | Preinstalado en Ubuntu |
| **python3-tk** | Interfaz gráfica del launcher | `sudo apt install python3-tk` |
| **nmap** *(opcional)* | Solo necesario en Windows (workflow V4) | `sudo ./scripts/install_nmap.sh` |

### Instalar Docker en Linux
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Instalar Docker en Windows
Instalá [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/).

> **Por qué Windows 11 necesita configuración extra:** Docker Desktop en Windows corre los containers dentro de una VM (WSL2). Sin configuración adicional, nmap escanea la red interna de esa VM en lugar de la red real de la empresa. La configuración de abajo soluciona esto.

#### Configurar WSL2 en modo mirrored (Windows 11 obligatorio)

Abrí (o creá) el archivo `%USERPROFILE%\.wslconfig` y agregá:

```ini
[wsl2]
networkingMode=mirrored
```

Luego reiniciá WSL2 desde PowerShell:
```powershell
wsl --shutdown
```

---

## ⚙️ Configuración previa (OBLIGATORIO antes de ejecutar)

### 1. Token y Chat ID de Telegram
Creá un bot con [@BotFather](https://t.me/BotFather) en Telegram:
1. Escribile `/newbot` y seguí los pasos
2. Guardá el **token** que te da (formato: `123456789:AAFxxx...`)
3. Escribile cualquier mensaje a tu bot
4. Abrí en el browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Buscá `"chat":{"id": XXXXXXX}` — ese es tu **Chat ID**

Luego en n8n (después de importar el workflow):
- Editá la credencial **"Telegram account"** con tu token
- En cada nodo Telegram, reemplazá el **Chat ID** por el tuyo

### 2. Red a escanear
La subred se configura desde el launcher GUI al momento de escanear. No hace falta tocar el workflow.

En el nodo **Code** del workflow podés actualizar la lista de IPs a ignorar:
```js
const ipsIgnoradas = ["192.168.X.1", "192.168.X.X"];  // router, host, etc.
```

### 3. Credenciales de email (opcional)
Editá el nodo **Send email** en n8n con tu dirección de origen y destino. Mailpit intercepta todos los emails localmente en `http://localhost:8025` sin necesidad de configurar nada extra.

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
Crea un acceso directo **SecurityLab.lnk** en el escritorio. Requiere Python 3 instalado desde [python.org](https://www.python.org/downloads/) con la opción **"Add Python to PATH"** marcada (tkinter viene incluido).

En ambos casos también podés correrlo directamente desde la terminal:
```bash
python3 launcher.py   # Linux
python launcher.py    # Windows
```

### 3. Importar el workflow en n8n

Hay dos versiones del workflow según el OS:

| Archivo | OS | Descripción |
|---|---|---|
| `workflows/workflowV3_linux.json` | Linux | nmap corre dentro del container n8n |
| `workflows/workflowV4_windows.json` | Windows 11 | nmap corre en el host |

**Pasos:**
1. Levantá el laboratorio desde el launcher (botón **Iniciar laboratorio**)
2. Abrí `http://localhost:5678`
3. Menú izquierdo → **Workflows** → botón **"..."** → **Import from file**
4. Seleccioná el archivo correspondiente a tu OS
5. Configurá las credenciales de Telegram (ver sección anterior)

> ⚠️ Este paso solo hace falta la primera vez. Los datos persisten en un volumen Docker.

---

## ▶️ Ejecutar el laboratorio y hacer un escaneo

### Con el launcher GUI (recomendado)

1. Abrí **Security Lab** desde el escritorio (o `python3 launcher.py`)
2. Hacé clic en **Iniciar laboratorio** y esperá a que diga "¡Laboratorio operativo!"
3. Abrí `http://localhost:5678`, abrí el workflow V3 y clickeá **"Listen for test event"** en el nodo Webhook
4. En el launcher, ingresá la subred, elegí el perfil de escaneo y hacé clic en **Escanear red**
5. Seguí la ejecución en tiempo real en n8n
6. Revisá Telegram para el resumen y `http://localhost:8025` para el reporte completo

**Perfiles de escaneo disponibles:**

| Perfil | Velocidad | Profundidad |
|---|---|---|
| Discovery | Muy rápido | Solo descubre hosts |
| Full & Fast | Moderado | Escaneo completo balanceado |
| Full & Fast Ultimate | Lento | Máxima cobertura |
| System Discovery | Rápido | Fingerprinting de SO y servicios |

> ⚠️ La primera vez que levantás el lab, OpenVAS tarda **15-30 minutos** en sincronizar los feeds de vulnerabilidades. Si el workflow falla con `404 scan config not found`, esperá y reintentá.

### Sin el launcher (alternativa por consola)

**Linux:**
```bash
docker compose up -d --build
```

**Windows 11** (PowerShell como Administrador):
```powershell
.\scripts\init_lab.ps1
```

Para escanear desde Windows con nmap en el host:
```powershell
.\scripts\scan.ps1 -Subnet 192.168.1.0/24
```

---

## 🛑 Apagar el laboratorio

Desde el launcher: botón **Detener laboratorio**.

O por consola:
```bash
docker compose down
```

Para borrar todos los datos y empezar de cero (⚠️ irreversible):
```bash
docker compose down -v
```

---

## 🗂️ Estructura del proyecto

```
TesisCiberseguridad/
├── docker-compose.yml             # Definición de todos los servicios
├── launcher.py                    # App GUI de escritorio (Linux)
├── README.md                      # Este archivo
├── n8n_custom/
│   └── Dockerfile                 # Imagen n8n con nmap + gvm-tools
├── scripts/
│   ├── install_launcher.sh        # Instala el ícono del launcher en el escritorio (Linux)
│   ├── install_launcher.bat       # Crea acceso directo del launcher (Windows)
│   ├── install_nmap.sh            # Instala nmap en el host (Linux, solo V4)
│   ├── install_nmap.ps1           # Instala nmap en el host (Windows, solo V4)
│   ├── init_lab.ps1               # Inicio del laboratorio (Windows, alternativa)
│   ├── stop_lab.sh                # Apagado del laboratorio (Linux, alternativa)
│   ├── stop_lab.ps1               # Apagado del laboratorio (Windows, alternativa)
│   └── scan.ps1                   # Escanea la red y envía a n8n (Windows)
└── workflows/
    ├── workflowV3_linux.json      # Workflow Linux: nmap interno, trigger webhook
    └── workflowV4_windows.json    # Workflow Windows: nmap en host, trigger webhook
```

---

## 🔧 Troubleshooting

| Problema | Solución |
|---|---|
| `permission denied` al correr el launcher | Agregá tu usuario al grupo docker: `sudo usermod -aG docker $USER` y cerrá sesión |
| El launcher no abre (Linux) | Instalá tkinter: `sudo apt install python3-tk` |
| El launcher no abre (Windows) | Instalá Python desde python.org marcando "Add to PATH" y "tcl/tk and IDLE" |
| `404: Failed to find config` en el workflow | Los feeds de OpenVAS no terminaron. Esperá 15 min y reintentá |
| Webhook 404 al escanear | Abrí el workflow en n8n y clickeá "Listen for test event" en el nodo Webhook |
| `chat not found` en Telegram | El Chat ID es incorrecto. Obtenelo con `/getUpdates` |
| `Unauthorized` en Telegram | El token fue revocado. Generá uno nuevo con BotFather |
| OpenVAS no levanta el socket | Revisá logs: `docker logs greenbone-community-edition-gvmd-1` |
| GSA no carga en el browser | Usá `http://127.0.0.1:9392` (no localhost, no HTTPS) |
| En Windows nmap no encuentra hosts | Verificá `networkingMode=mirrored` en `.wslconfig` y reiniciá WSL2 con `wsl --shutdown` |
| En Windows el script no corre | Abrí PowerShell como Administrador y ejecutá `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
