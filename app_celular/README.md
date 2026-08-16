# 📱 Aura Mobile — App de disparo de escaneo

> ⚠️ **Estado: versión preliminar / MVP.** Esta app todavía **no reemplaza** a Telegram — hoy solo dispara el escaneo. Ver [Roadmap](#-roadmap) más abajo para el alcance planeado.

App Flutter que actúa como cliente disparador del sistema de gestión de vulnerabilidades ["Aura"](../README.md), permitiendo iniciar un análisis desde el celular sin necesidad de tocar el Launcher de escritorio.

## Qué hace (hoy)

1. Ingresás la IP del servidor donde corre n8n (la misma máquina donde tenés el laboratorio Docker levantado), la subred a escanear y el perfil de análisis.
2. Al tocar **"Escanear red"**, la app hace un `POST` directo al webhook de producción del workflow V3 (`/webhook/nmap-v3`) — el mismo endpoint que usa `launcher.py` en modo Linux/interno.
3. El escaneo corre en OpenVAS como siempre. **El resultado sigue llegando por Telegram y por email** — la app no lo muestra todavía.

## Qué NO hace (todavía)

- No recibe ni muestra el resultado del escaneo.
- No tiene notificaciones push.
- No tiene historial de escaneos anteriores.
- No valida que el host de n8n sea alcanzable antes de disparar (asumí que estás en la misma red).

## 🗺️ Roadmap

El objetivo de esta app es **reemplazar progresivamente el canal de Telegram**, incorporando la notificación directamente en la app:

1. **Fase actual (MVP):** solo disparo del escaneo. Telegram sigue siendo el canal de notificación.
2. **Próxima fase:** la app recibe una notificación push cuando el escaneo termina, con un **resumen compacto** (igual al que hoy manda Telegram: hosts, total de hallazgos, desglose por severidad). Esto requiere un mecanismo de callback desde n8n hacia la app (candidatos: Firebase Cloud Messaging desde un nodo HTTP Request al finalizar el workflow, o polling periódico contra la API de n8n).
3. **El correo electrónico con el reporte completo (HTML detallado) se mantiene sin cambios** — la app y Telegram son canales de resumen rápido, el email sigue siendo el canal del reporte completo para el analista técnico. Esto es intencional y coincide con la separación de audiencias descripta en la tesis (Cap. IV.6).

## Requisitos

- Flutter 3.44+ (`flutter --version` para confirmar)
- El laboratorio (`docker compose up -d` en la raíz del repo) corriendo y accesible en red desde el celular
- El workflow `workflowV3` importado y **activo** en n8n

## Correr en desarrollo

```bash
cd app_celular
flutter pub get
flutter run
```

## Notas de red

El celular y la PC con Docker tienen que estar en la misma red local. Poné la IP LAN de la PC (no `localhost`, eso apunta al propio celular) en el campo "Host de n8n" — por ejemplo `192.168.100.143`.

Si la PC tiene Windows con Docker Desktop y la app no logra conectar por Wi-Fi (ver [Errores encontrados](#-errores-encontrados-y-fixes-durante-el-testing) más abajo), la alternativa más simple para testing es probar por **cable USB**:

```bash
adb reverse tcp:5678 tcp:5678
```

Y poné `127.0.0.1` como "Host de n8n" en la app — el tráfico viaja por el cable, sin depender de la red Wi-Fi ni del firewall de Windows.

## 🐛 Errores encontrados y fixes durante el testing

Durante el primer testeo end-to-end en un dispositivo físico (Xiaomi 14, Android 16) aparecieron varios problemas reales, ninguno relacionado con la lógica de negocio de la app:

### 1. Instalación bloqueada por MIUI/HyperOS
Xiaomi bloquea la instalación de APKs por USB aunque la Depuración USB esté activa. **Fix:** activar además **"Instalación vía USB"** en Opciones de desarrollador (requiere sesión iniciada con cuenta Mi). Es un problema del fabricante del teléfono, no de la app.

### 2. `SocketException: Connection failed (OS Error: Operation not permitted, errno = 1)`
La build en modo `--release` no tenía permiso de red. Flutter agrega automáticamente el permiso `INTERNET` al manifest de *debug* pero **no al de release** — si el build es release y la app hace networking, hay que declararlo a mano.

**Fix** en `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
```
Se agregó también `android:usesCleartextTraffic="true"` en el tag `<application>`, porque el laboratorio se sirve por HTTP plano (sin TLS) en la LAN — Android bloquea tráfico cleartext por defecto desde API 28.

### 3. `TimeoutException` al conectar por la IP LAN de la PC
Con los permisos ya arreglados, la conexión seguía fallando por Wi-Fi. Causa: Docker Desktop en Windows (WSL2) solo expone los puertos publicados en `127.0.0.1`, no en la IP real de la LAN, incluso con `networkingMode=mirrored` configurado en `.wslconfig`. Se intentó `netsh interface portproxy` + regla de firewall (funciona para host físicos como Metasploitable2, ver README raíz del proyecto) pero **no fue confiable para el puerto 5678 de n8n** en esta sesión de testing.

**Fix aplicado para destrabar el testing:** en vez de pelear con el networking de Windows, se usó **`adb reverse tcp:5678 tcp:5678`** para túnelizar el puerto por el cable USB (el celular ya estaba conectado para hacer `flutter run`). Es la solución recomendada para testing con dispositivo físico — no depende de la red Wi-Fi para nada. Ver sección "Notas de red" arriba.

### 4. Contenedor de n8n caído sin que nadie lo notara
En un momento del testeo, el contenedor `n8n-security-lab` se había detenido (probablemente al cerrar Docker Desktop u otra ventana sin querer), y el error de conexión se confundió al principio con un problema de la app. **Aprendizaje:** antes de debuggear la app, verificar siempre `docker ps` — el error de red desde el celular es indistinguible de "el servidor está apagado".

### 5. Timeout interno de n8n corta escaneos multi-host casi terminados
Al disparar un escaneo contra 4 hosts desde la app, el escaneo real de OpenVAS llegó al 97-98% de progreso pero el nodo `PollStatus` del workflow abandonó por su propio timeout antes de que el escaneo terminara — no llegó notificación a Telegram para esa corrida. El límite está *hardcodeado* en 40 intentos × 60 segundos = 40 minutos (`MAX_ATTEMPTS = 40`, `POLL_INTERVAL = 60000` en el nodo `PollStatus` del workflow), pero el mensaje de error que tira dice *"superó el tiempo máximo de espera (60 minutos)"* — el texto no coincide con el valor real del código. **Pendiente de decidir:** si subir el límite real (recomendado para escaneos multi-host) o solo corregir el texto del mensaje. No bloquea el uso de la app — el disparo del escaneo en sí funcionó correctamente, es una limitación del workflow de n8n en escaneos largos con múltiples hosts.
