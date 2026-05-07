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

- **Sistema operativo:** Linux (Ubuntu 20.04+ recomendado)
- **Docker** >= 24.0
- **Docker Compose** >= 2.0
- **RAM:** mínimo 4GB (recomendado 8GB)
- **Disco:** mínimo 20GB libres (las imágenes de Greenbone son pesadas)
- Acceso a internet para descargar imágenes y feeds de vulnerabilidades

### Instalar Docker (si no lo tenés)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

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

### 2. Dar permisos al script
```bash
chmod +x scripts/init_lab.sh
```

### 3. Ejecutar el laboratorio
```bash
cd scripts
sudo ./init_lab.sh
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
1. Abrí `http://localhost:5678`
2. Menú izquierdo → **Workflows** → botón **"..."** → **Import from file**
3. Seleccioná el archivo `workflows/My_workflow.json`
4. Configurá las credenciales de Telegram (ver sección anterior)
5. Activá el workflow con el toggle

---

## ▶️ Ejecutar el escaneo

1. Abrí `http://localhost:5678`
2. Abrí el workflow importado
3. Hacé clic en **"Execute workflow"**
4. Esperá ~30 minutos (el escaneo de OpenVAS tarda)
5. Revisá Telegram para el resumen y Mailpit (`http://localhost:8025`) para el reporte completo

---

## 🛑 Apagar el laboratorio

```bash
# Solo parar (conserva datos):
sudo docker compose down

# Parar y borrar todos los datos (reset completo):
sudo docker compose down -v
```

---

## 🗂️ Estructura del proyecto

```
entrega_final/
├── docker-compose.yml        # Definición de todos los servicios
├── README.md                 # Este archivo
├── n8n_custom/
│   └── Dockerfile            # Imagen n8n con nmap + gvm-tools
├── scripts/
│   └── init_lab.sh           # Script de inicio automático
└── workflows/
    └── My_workflow.json      # Workflow de n8n para importar
```

---

## 🔧 Troubleshooting

| Problema | Solución |
|---|---|
| `permission denied` al correr el script | Usá `sudo ./init_lab.sh` |
| `apk: not found` en el build | Verificá que el Dockerfile use `FROM n8nio/n8n:latest` |
| `404: Failed to find config` en el workflow | Los feeds de OpenVAS no terminaron. Esperá 15 min y reintentá |
| `chat not found` en Telegram | El Chat ID es incorrecto. Obtenelo con `/getUpdates` |
| `Unauthorized` en Telegram | El token fue revocado. Generá uno nuevo con BotFather |
| `Connection refused` al socket de gvmd | OpenVAS todavía está inicializando. Esperá y reintentá |
| OpenVAS no levanta el socket | Revisá logs: `sudo docker logs greenbone-community-edition-gvmd-1` |
| GSA no carga en el browser | Usá `http://127.0.0.1:9392` (no localhost, no HTTPS) |
