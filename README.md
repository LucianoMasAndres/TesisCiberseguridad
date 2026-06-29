# 🛡️ Automatización de Análisis de Vulnerabilidades (n8n + OpenVAS)

Este proyecto despliega un entorno de orquestación de seguridad completamente automatizado usando **n8n** integrado con **Greenbone Community Edition (OpenVAS)**. El sistema realiza escaneos de red, detecta vulnerabilidades y notifica los resultados por **Telegram** y **email**.

## 🧱 Arquitectura

```
[Trigger Manual]
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
         [Wait 30min]
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

### Dependencias del host

Estas son las únicas cosas que hay que instalar en la máquina. Todo lo demás (OpenVAS, n8n, Mailpit, PostgreSQL, Redis, etc.) son imágenes Docker que se descargan solas la primera vez.

| Dependencia | Para qué | Instalación |
|---|---|---|
| **Docker** >= 24.0 | Correr los contenedores | Ver abajo |
| **Docker Compose** v2 | Orquestar el stack | Viene incluido con Docker moderno |
| **Usuario en grupo docker** | Que el launcher pueda correr Docker sin sudo | `sudo usermod -aG docker $USER` + cerrar sesión y volver a entrar |
| **Python 3** | Correr el launcher GUI | Preinstalado en Ubuntu |
| **python3-tk** | Interfaz gráfica del launcher | `sudo apt install python3-tk` |
| **nmap** *(opcional)* | Escanear desde el launcher (solo workflow V4) | `sudo ./scripts/install_nmap.sh` |
| macOS | ❌ No soportado | Misma limitación que Windows 10 |

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

Esto hace que los containers compartan la red real de Windows y nmap pueda alcanzar la red de la empresa.

---

## ⚙️ Configuración previa (OBLIGATORIO antes de ejecutar)

Antes de levantar el lab, hay tres cosas que configurar:

### 1. Token y Chat ID de Telegram
Creá un bot con [@BotFather](https://t.me/BotFather) en Telegram:
1. Escribile `/newbot` y seguí los pasos
2. Guardá el **token** que te da (formato: `123456789:AAFxxx...`)
3. Escribile cualquier mensaje a tu bot
4. Abrí en el browser: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Buscá `"chat":{"id": XXXXXXX}` — ese es tu **Chat ID**

Luego en n8n:
- Editá la credencial **"Telegram account"** con tu token
- En el nodo Telegram, reemplazá el campo **Chat ID** por el tuyo

> ⚠️ El archivo `workflows/My_workflow.json` tiene un Chat ID de ejemplo. Reemplazalo por el tuyo en el nodo Telegram dentro de n8n después de importar el workflow.

### 2. Red a escanear
En el nodo **Nmap** del workflow, cambiá la red según tu entorno:
```
nmap -sn -n -oX - 192.168.100.0/24   ← cambiá esta subred
```

En el nodo **Code**, actualizá la lista de IPs a ignorar:
```js
const ipsIgnoradas = ["192.168.X.1", "192.168.X.X"];  // router, host, etc.
```

### 3. Credenciales de email (opcional)
Si querés recibir el reporte por email, editá el nodo **Send email** en n8n con tu dirección de origen y destino. Mailpit intercepta todos los emails localmente en `http://localhost:8025` sin necesidad de configurar nada extra.

---

## 🚀 Instalación y Ejecución

### 1. Clonar / descomprimir el proyecto
```bash
cd ~/Desktop
# Si es un zip:
unzip entrega_final.zip
cd entrega_final
```

### 2. Ejecutar el laboratorio

**Linux:**
```bash
chmod +x scripts/init_lab.sh
sudo ./scripts/init_lab.sh
```

**Windows 11** (PowerShell como Administrador):
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\init_lab.ps1
```

El script automáticamente:
- Construye la imagen de n8n con nmap y gvm-tools instalados
- Descarga todas las imágenes de Greenbone (~3-5GB, solo la primera vez)
- Espera a que OpenVAS levante el socket Unix
- Crea el usuario `admin` con password `admin123`

Al finalizar verás:
```
✨ ¡Laboratorio Operativo!
---------------------------------------------------
➡️  n8n:     http://localhost:5678
➡️  OpenVAS: http://localhost:9392  (admin / admin123)
➡️  Mailpit: http://localhost:8025
---------------------------------------------------
```

> ⚠️ **Importante:** La primera vez que levantás el lab, OpenVAS tarda **15-30 minutos** en sincronizar todos los feeds de vulnerabilidades. Si el workflow falla con error `404 scan config not found`, esperá unos minutos y volvé a ejecutarlo.

### 4. Importar el workflow en n8n

Hay dos versiones del workflow según el OS:

| Archivo | OS | Cómo se dispara |
|---|---|---|
| `workflows/workflowV3_linux.json` | Linux (con WSL2 mirrored en Win11) | Botón "Execute workflow" en n8n |
| `workflows/workflowV4_windows.json` | Windows / cualquier OS | Script `scan.sh` o `scan.ps1` desde el host |

**Pasos para importar:**
1. Abrí `http://localhost:5678`
2. Menú izquierdo → **Workflows** → botón **"..."** → **Import from file**
3. Seleccioná el archivo correspondiente a tu OS
4. Configurá las credenciales de Telegram (ver sección anterior)
5. Activá el workflow con el toggle (**obligatorio para V4 — el webhook no responde si está inactivo**)

---

## ▶️ Ejecutar el escaneo

**Linux — workflow V3 (nmap corre dentro del container):**
1. Abrí `http://localhost:5678`
2. Abrí el workflow V3
3. Hacé clic en **"Execute workflow"**
4. Esperá ~30 minutos (el escaneo de OpenVAS tarda)
5. Revisá Telegram para el resumen y Mailpit (`http://localhost:8025`) para el reporte completo

**Windows / cualquier OS — workflow V4 (nmap corre en el host):**
1. Instalá nmap en tu máquina (solo la primera vez):
```powershell
# Windows
.\scripts\install_nmap.ps1
```
```bash
# Linux
sudo ./scripts/install_nmap.sh
```
2. Con el laboratorio corriendo y el workflow V4 activo, ejecutá el escaneo:
```powershell
# Windows — cambiá la subred por la de tu red
.\scripts\scan.ps1 -Subnet 192.168.1.0/24
```
```bash
# Linux
sudo ./scripts/scan.sh 192.168.1.0/24
```
3. n8n recibe los resultados automáticamente y lanza el escaneo en OpenVAS
4. Esperá ~30 minutos y revisá Telegram y Mailpit

---

## 🛑 Apagar el laboratorio

**Linux:**
```bash
sudo ./scripts/stop_lab.sh
```

**Windows 11** (PowerShell como Administrador):
```powershell
.\scripts\stop_lab.ps1
```

---

## 🗂️ Estructura del proyecto

```
entrega_final/
├── docker-compose.yml             # Definición de todos los servicios
├── README.md                      # Este archivo
├── n8n_custom/
│   └── Dockerfile                 # Imagen n8n con nmap + gvm-tools
├── scripts/
│   ├── init_lab.sh                # Inicio del laboratorio (Linux)
│   ├── init_lab.ps1               # Inicio del laboratorio (Windows)
│   ├── stop_lab.sh                # Apagado del laboratorio (Linux)
│   ├── stop_lab.ps1               # Apagado del laboratorio (Windows)
│   ├── install_nmap.sh            # Instala nmap en el host (Linux)
│   ├── install_nmap.ps1           # Instala nmap en el host (Windows)
│   ├── scan.sh                    # Escanea la red y envía a n8n (Linux)
│   └── scan.ps1                   # Escanea la red y envía a n8n (Windows)
└── workflows/
    ├── workflowV3_linux.json            # Workflow con nmap interno (Linux nativo)
    └── workflowV4_windows.json    # Workflow con webhook (Windows / cualquier OS)
```

---

## 🔧 Troubleshooting

| Problema | Solución |
|---|---|
| `permission denied` al correr el script | Usá `sudo ./scripts/init_lab.sh` |
| `apk: not found` en el build | Verificá que el Dockerfile use `FROM n8nio/n8n:latest` |
| `404: Failed to find config` en el workflow | Los feeds de OpenVAS no terminaron. Esperá 15 min y reintentá |
| `chat not found` en Telegram | El Chat ID es incorrecto. Obtenelo con `/getUpdates` |
| `Unauthorized` en Telegram | El token fue revocado. Generá uno nuevo con BotFather |
| `Connection refused` al socket de gvmd | OpenVAS todavía está inicializando. Esperá y reintentá |
| OpenVAS no levanta el socket | Revisá logs: `sudo docker logs greenbone-community-edition-gvmd-1` |
| GSA no carga en el browser | Usá `http://127.0.0.1:9392` (no localhost, no HTTPS) |
| En Windows nmap no encuentra hosts | Verificá que configuraste `networkingMode=mirrored` en `.wslconfig` y reiniciaste WSL2 con `wsl --shutdown` |
| En Windows el script no corre | Abrí PowerShell como Administrador y ejecutá `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` antes de correr el `.ps1` |
