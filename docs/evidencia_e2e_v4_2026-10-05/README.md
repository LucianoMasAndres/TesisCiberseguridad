# Verificación sobre el laboratorio con el código de la etiqueta (5/10/2026)

Evidencia de la sesión del 5 de octubre de 2026, con el laboratorio de 12 activos, Greenbone
Community Edition y n8n desplegados desde este repositorio, y los flujos V4 y V3 de la etiqueta
`tfi-2026-10-04` importados en n8n. Los flujos desplegados son los JSON de `workflows/` con dos
datos del operador cargados: el token del bot de Telegram y el destinatario del correo.
Ningún archivo de esta carpeta contiene el token ni el secreto de los webhooks.

Complementa a `docs/evidencia_e2e_v4_2026-10-04/`, cuyas ejecuciones corrieron con versiones
anteriores del flujo.

| Archivo | Qué es |
|---|---|
| `ejecucion_127_full_and_fast.json` | Resumen de la ejecución 127 de n8n: flujo V4 completo por el webhook de escaneo interno, perfil «Full and fast», con el código de la etiqueta |
| `correo_mailpit_ejecucion_127.html` | Cuerpo HTML del correo de esa ejecución, tal como lo recibió Mailpit |
| `seguridad_webhooks.txt` | Recomprobación de la autenticación y de la validación de entradas con el código de la etiqueta |
| `escaner_carga_de_pruebas.txt` | Registro de `ospd-openvas`: la carga de las pruebas de vulnerabilidad falló en los arranques en frío del 4/10 y del 5/10 |
| `correo_mailpit_ejecucion_85_escaner_sin_pruebas.html` | Correo «SIN HALLAZGOS» que emitió una versión anterior del flujo cuando el escáner no había evaluado nada |
| `mail16_antes_y_despues.txt` | Puertos de 172.20.0.16 antes y después de la ejecución 127 |

## Ejecución 127 (flujo V4 completo, código de la etiqueta)

- Disparo: `POST /webhook/nmap-interno?scan_config=daba56c8-73ec-11df-a475-002264764cea` («Full and fast») con el encabezado `X-Lab-Token`.
- De 14:22:17 a 14:54:32 UTC: 32:15 min. Estado: `success`.
- Nodos ejecutados: 17 de los 21 del flujo, todos con éxito (`Cleanup` corre dos veces, una por cada rama que llega a él).
- Descubrimiento (`NmapScan`): 12 hosts con puertos abiertos en 172.20.0.0/24, en 170,6 s.
- Clasificación (`ClassifyAssets`): 12 de 12 coinciden con el Anexo F de la tesis (3 Normal, 6 Alto y 3 Crítico). 172.20.0.16 expuso sus tres puertos (22, 25 y 587); el contenedor `mail-16` se había reiniciado un minuto antes.
- Enviados a Greenbone: 9 activos (172.20.0.12, .13, .14, .15, .16, .17, .19, .20 y .21).
- Reporte: 39 hallazgos con severidad mayor que 0 (7 de severidad crítica, 1 alta, 7 media y 24 baja, según los rangos del nodo `BuildReport`). Los 7 críticos son el aviso de sistema operativo sin soporte (Debian 11) en .12, .13, .14, .16, .17, .19 y .20; el alto es Redis sin autenticación en .21.
- Telegram: mensaje de inicio `ok: true` (message_id 71) y mensaje de reporte `ok: true` (message_id 72).
- Correo: aceptado por Mailpit (`250 2.0.0 Ok: queued as 0dGrUSp6LP6cPzUpqcXPcO`), 14518 bytes; asunto «Reporte de Red (9 Hosts) - 🔴 CRITICO»; cuerpo HTML de 12697 caracteres en la salida de `BuildReport` (13240 en el archivo guardado desde Mailpit).
- Limpieza: la tarea y el objetivo pasaron a la papelera de Greenbone; la cantidad de objetivos activos en gvmd quedó igual que antes de la ejecución (57).

| Nodo | Estado | Duración |
|---|---|---|
| Webhook Escaneo Interno | success | 1 ms |
| NmapScan | success | 170,6 s |
| ClassifyAssets | success | 20 ms |
| ¿Hay hosts? | success | 8 ms |
| CreateTarget | success | 499 ms |
| CreateTask | success | 480 ms |
| StartTask | success | 499 ms |
| Telegram Scan Iniciado | success | 992 ms |
| PollStatus | success | 1756,3 s |
| ¿Timeout? | success | 47 ms |
| DownloadReport | success | 1,7 s |
| ReportXmlToJson | success | 351 ms |
| ParseFindings | success | 375 ms |
| BuildReport | success | 99 ms |
| Telegram Reporte Final | success | 1,0 s |
| Cleanup | success | 1,0 s |
| Send Email | success | 141 ms |
| Cleanup | success | 862 ms |

## Controles de entrada (`seguridad_webhooks.txt`)

- Sin el encabezado o con un valor incorrecto, los tres webhooks (`/webhook/nmap`, `/webhook/nmap-interno` y `/webhook/nmap-v3`) respondieron 403 y no se creó ninguna ejecución.
- Con el encabezado correcto, una orden inyectada en la dirección, una dirección externa y un cuerpo sin `hosts` terminaron con error en `ClassifyAssets`; un perfil ajeno a la lista, con error en `CreateTarget`. En ningún caso se creó un objetivo en Greenbone.
- Un activo con el puerto 80 repetido tres veces sumó 5 puntos y clasificó Normal: el puerto repetido cuenta una vez.

## El escáner sin pruebas cargadas

- En los dos arranques en frío registrados (`escaner_carga_de_pruebas.txt`), `ospd-openvas` falló al cargar las pruebas de vulnerabilidad («Updating VTs failed») y no volvió a intentarlo. gvmd respondía con normalidad. La carga se completó recién después de reiniciar el contenedor.
- En ese estado, el 5/10 a las 12:56 UTC, una ejecución completa con «Full and fast» (ejecución 85 de n8n, con la versión anterior del flujo, commit `71c2377`) terminó en 6 minutos. Greenbone marcó la tarea como `Done` con cero resultados, ni siquiera informativos (`docs/fixtures/gmp_report_escaner_sin_vts.xml`), y el flujo envió el correo «SIN HALLAZGOS» sobre los 9 activos y mandó la tarea a la papelera.
- La versión etiquetada no informa «sin hallazgos» en ese caso: `ParseFindings` exige que el reporte registre al menos un resultado y, si no, falla con un error; la tarea queda en Greenbone. Ese reporte real es uno de los casos de `docs/test_no_findings.js`. Los scripts de inicio y el Launcher esperan la carga de las pruebas y reinician el escáner si falla.
- La versión corregida no se probó contra un escáner sin pruebas cargadas en el laboratorio: la falla ocurre en el arranque en frío y no se provocó a propósito. La cubre la prueba automatizada, con el reporte real.

## `mail-16` después del análisis

`mail16_antes_y_despues.txt`: 172.20.0.16 tenía abiertos los puertos 22, 25 y 587 al lanzar la ejecución 127, y solo el 22 después (25 y 587 `filtered`), sin que el contenedor se reiniciara ni terminara. Es la misma degradación observada en la campaña del 14/08/2026 (`docs/anexo_e_f_v2.md`): sigue a un análisis «Full and fast» del propio sistema. Con los tres puertos abiertos, `NmapScan` tardó 170,6 s; con solo el 22, en la ejecución de referencia del 4/10, 19 s.

## Qué no prueban

- Es una ejecución suelta: no mide variabilidad ni reemplaza a la campaña, y sus hallazgos no son comparables con los de la Tabla 4 (otra fecha, aviso de Debian 11 sin soporte).
- No se ejercitaron en el laboratorio la rama de escaneo no completado (timeout, `Stopped`, `Interrupted`), el reporte ilegible, el análisis sin ningún resultado registrado ni el reporte «sin hallazgos» de un escáner sano: los cubren `docs/test_no_findings.js` y `docs/test_workflow_contract.js`.
- La verificación de los controles cubre los vectores descritos; no es una prueba de penetración.
