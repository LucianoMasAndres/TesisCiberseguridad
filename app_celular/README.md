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
