# Ejecuciones completas del flujo V4 y verificación de los controles de los webhooks (4/10/2026)

Evidencia de ejecuciones de extremo a extremo de `workflows/workflowV4_windows.json`
sobre el laboratorio de 12 activos, hechas al endurecer los webhooks, y de la
verificación de sus controles de entrada sobre ese mismo despliegue.

**No forman parte de la campaña de medición** del 14/08/2026 ni se usan en las
comparaciones de la tesis: son ejecuciones de verificación funcional.

## Archivos

| Archivo | Contenido |
|---|---|
| `ejecucion_2_full_and_fast.json` | La ejecución de referencia: flujo completo por el webhook de escaneo interno, perfil «Full and fast» |
| `correo_mailpit_ejecucion_2.html` | Cuerpo HTML del correo de esa ejecución, tal como lo recibió Mailpit |
| `telegram_reporte_ejecucion_2.png` | Captura del mensaje de Telegram con el reporte de esa ejecución (Figura 4 de la tesis) |
| `mailpit_correo_ejecucion_2.png` | Captura del correo de esa ejecución en la interfaz de Mailpit (Figura 5 de la tesis) |
| `ejecucion_3_webhook_nmap.json` | Ejecución por el webhook externo (`/webhook/nmap`) con la versión etiquetada, perfil de descubrimiento |
| `ejecucion_1_previa.json` | Ejecución anterior a dos correcciones (ver abajo) |
| `seguridad_webhooks.txt` | Peticiones sin encabezado, con encabezado incorrecto y con entradas manipuladas, y su resultado |

Los resúmenes se tomaron de la base de n8n: estado y duración de cada nodo,
clasificación de los activos, respuestas de la API de Telegram, reporte y respuesta
SMTP. No incluyen los encabezados de la petición ni el identificador de chat.

## Ejecución 2 (referencia)

- Disparo: `POST /webhook/nmap-interno?scan_config=daba56c8-73ec-11df-a475-002264764cea` (perfil «Full and fast»), con el encabezado `X-Lab-Token`.
- De 10:38:22 a 11:06:09 UTC: 27:48 min. Estado: `success`.
- Nodos ejecutados: 17 de los 21 del flujo, todos con éxito (la rama de «red limpia», la de timeout y los otros dos disparadores no corresponden a esta ruta).
- Descubrimiento (`NmapScan`, asíncrono): 12 hosts con puertos abiertos en 172.20.0.0/24: los 12 activos del laboratorio.
- Clasificación (`ClassifyAssets`): 12 activos; 11 de 12 coinciden con el Anexo F. La excepción es 172.20.0.16, que expuso solo [22] y clasificó Normal (9 puntos): el contenedor de correo no aceptaba conexiones en los puertos 25 y 587, el mismo defecto del laboratorio observado en la campaña (`docs/anexo_e_f_v2.md`).
- Enviados a Greenbone: 8 activos (172.20.0.12, 172.20.0.13, 172.20.0.14, 172.20.0.15, 172.20.0.17, 172.20.0.19, 172.20.0.20, 172.20.0.21).
- Reporte: 35 hallazgos con severidad mayor que 0 (6 de severidad crítica, 1 alta, 7 media y 21 baja, según los rangos del nodo `BuildReport`).
- Telegram: mensaje de inicio `ok: true` (message_id 55) y mensaje de reporte `ok: true` (message_id 56).
- Correo: aceptado por Mailpit (`250 2.0.0 Ok: queued as 0xGGztui6zrmLKf0oaHYr7`), 12858 bytes; asunto «Reporte de Red (8 Hosts) - 🔴 CRITICO»; cuerpo HTML de 11680 caracteres.

| Nodo | Estado | Duración |
|---|---|---|
| Webhook Escaneo Interno | success | 1 ms |
| NmapScan | success | 19.2 s |
| ClassifyAssets | success | 20 ms |
| ¿Hay hosts? | success | 10 ms |
| CreateTarget | success | 464 ms |
| CreateTask | success | 503 ms |
| StartTask | success | 568 ms |
| Telegram Scan Iniciado | success | 952 ms |
| PollStatus | success | 1637.8 s |
| ¿Timeout? | success | 160 ms |
| DownloadReport | success | 2.4 s |
| ReportXmlToJson | success | 1.8 s |
| ParseFindings | success | 358 ms |
| BuildReport | success | 45 ms |
| Telegram Reporte Final | success | 1.0 s |
| Cleanup | success | 1.3 s |
| Send Email | success | 209 ms |
| Cleanup | success | 877 ms |

El código de esta ejecución es el de la etiqueta `tfi-2026-10-04` salvo una
comprobación que se agregó después: `CreateTarget` valida el perfil de escaneo antes
de crear el objetivo. La ejecución 3 corrió con esa comprobación.

## Ejecución 3 (webhook externo, versión etiquetada)

- Disparo: `POST /webhook/nmap?scan_config=8715c877-47a0-438d-98a3-27c7a6ab2196` (perfil de descubrimiento) con dos hosts en el cuerpo, uno Crítico (.13) y uno Normal (.11).
- De 11:08:32 a 11:11:39 UTC: 3:08 min. Estado: `success`; 16 nodos, todos con éxito.
- Enviado a Greenbone: 172.20.0.13 (el activo Normal queda fuera).

## Ejecución 1 (previa a dos correcciones)

- Mismo disparo que la ejecución 2. De 10:05:01 a 10:36:35 UTC: 31:33 min. Estado: `success`; 17 nodos.
- Clasificación: 12 de 12 coinciden con el Anexo F; 9 activos enviados a Greenbone; 39 hallazgos.
- Los dos mensajes de Telegram se entregaron (`ok: true`), y Mailpit aceptó el correo, pero **el correo llegó sin el cuerpo del reporte** (692 bytes). El nodo `Send Email` (emailSend 2.1) pasaba el cuerpo en el parámetro `message`, que esa versión del nodo no lee; el cuerpo va en `html`. El flujo de la campaña (commit `47ff2f4`) tenía el mismo parámetro, así que sus correos, si se enviaron, tampoco llevaban el reporte.
- Un intento anterior (09:56 UTC, ejecución 74 de n8n) terminó a los 2,5 min con «Task execution aborted because runner became unresponsive»: `NmapScan` llamaba a Nmap de forma síncrona y el escaneo de puertos (166 s en una medición directa) superó los 120 s del heartbeat del Task Runner. Desde entonces el nodo usa `execFile` asíncrono.

## Qué no prueban

- Son ejecuciones sueltas: no miden variabilidad ni reemplazan a la campaña.
- Los hallazgos no son comparables con los de la campaña: cambió el feed y, desde el
  31/08/2026, Greenbone informa Debian 11 como sistema operativo sin soporte
  (severidad 10,0) en seis activos.
- La verificación de los controles cubre los vectores descritos en
  `seguridad_webhooks.txt`; no es una prueba de penetración.
