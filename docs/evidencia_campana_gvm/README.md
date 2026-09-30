# Trazabilidad de la campaña automatizada del 14/08/2026

Qué se ejecutó en la campaña que generó `docs/experiment_results.jsonl`, reconstruido
a partir del contenido de los archivos del repositorio y de la base de gvmd del
laboratorio donde corrió.

## Qué escaneó Greenbone

`targets_campana_2026-08-14.txt` es la consulta a gvmd (contenedor `pg-gvm`) de las
cinco tareas de la campaña. En cada repetición, el target contiene **solo los activos
Alto/Crítico** de esa repetición (9, 8, 7, 7 y 9 hosts). La lista coincide, host por
host, con los activos no Normales de `clasificacion` en `experiment_results.jsonl`.
Los activos Normal (.10, .11, .18) nunca se enviaron a Greenbone.

- Lista de puertos del target: `All IANA assigned TCP`. Greenbone no sondeó puertos
  UDP; en particular, SNMP (161/udp) del activo .17 no pudo ser evaluado por
  Greenbone, aunque Nmap sí lo detectó (`U:161`) y cuenta para su clasificación.
- Perfil de escaneo: `Full and fast`.
- El nombre del target, `Target Masivo (N hosts) - <fecha>`, es el que genera el
  nodo `CreateTarget` de `workflows/workflowV4_windows.json`.

## Qué camino recorrió cada repetición

`docs/run_experiment.js` hizo el descubrimiento y el escaneo de puertos con Nmap
(T0→T1), y envió los hosts con sus puertos por POST a `/webhook/nmap` de
workflowV4 (T1→T2). El nodo `Code` del flujo aplicó `classifyAsset` y el flujo creó
el target y la tarea en Greenbone solo con los Alto/Crítico. El script esperó la
tarea consultando GMP (T2→T3).

- La clasificación que decidió qué recibía Greenbone la hizo el flujo de n8n (nodo
  `Code`). El script también clasifica, pero solo para registrarlo en el dataset;
  ambos usaban la misma tabla de pesos (3306/5432/6379 = 10 en ese momento, ver
  `docs/anexo_e_f_v2.md`).
- El nodo `NmapScan` del flujo **no** se ejecutó en la campaña: el descubrimiento
  medido es el de Nmap invocado por el script, con los mismos comandos que ese nodo.
- Los ≈16 s entre "webhook disparado" y "Tarea Greenbone" en `experiment_log.txt`
  corresponden a una espera fija de 15 s del script (`sleep(15000)`) antes de buscar
  la tarea, no al tiempo de CreateTarget/CreateTask/StartTask.

## Qué versión del script corrió

La versión exacta de `docs/run_experiment.js` que produjo el dataset **no se
conservó**. El commit `47ff2f4` (14/08/2026, confirmado después de terminar la
campaña) contiene la más cercana, con al menos dos cambios posteriores a la corrida:

- la consulta `get_reports` con `filter='rows=1000'`. Por eso `experiment_log.txt`
  registra "0 hallazgos" en cada repetición: la versión que corrió leía solo la
  primera página del reporte;
- la exclusión de `.1`, `.2` y `.3` del descubrimiento. El dataset registra `.3` en
  las cinco repeticiones, cosa imposible con ese filtro: se agregó después.

El resto del script (comandos de Nmap, regex de `<host>`, `classify()` con peso 10,
webhook `/webhook/nmap`, espera de 15 s) coincide con lo que registra el dataset. Los hallazgos del dataset se extrajeron
después, sobre los mismos reportes, con `docs/reextract_findings.js` (incluido en el
mismo commit). Las demás diferencias con la versión actual del script (regex de
descubrimiento, paginación de `get_tasks`, extracción de CVE por `<refs>`, peso 11)
son posteriores a la campaña y no afectan sus datos. El campo `cve` del dataset quedó
vacío en los 108 hallazgos porque la extracción por `<refs>` no se volvió a correr
sobre él.

## Hasta dónde llegó el flujo en cada repetición

`tareas_papelera_2026-08-14.txt`: las cinco tareas de la campaña están en la papelera
de gvmd (`hidden = 2`). En workflowV4 (commit `47ff2f4`) el nodo `Cleanup` las envía
ahí con `delete_task ultimate='0'`, y se ejecuta después de `DownloadPDF` → `XML1` →
`parseo` → `Code in JavaScript2` → `Send a text message1` (Telegram de resultados).
Ningún otro script del repositorio borra tareas. El estado es compatible, entonces,
con que el flujo recorrió en las cinco repeticiones la descarga, el parseo y el nodo
de Telegram hasta `Cleanup`. No prueba la entrega del mensaje (el nodo de Telegram
continúa aunque falle) ni el envío del correo, que es una rama paralela. El
historial de ejecuciones de n8n de esa fecha no se conserva (poda automática), y
Mailpit guarda los correos en memoria.

## Nivel de QoD de los hallazgos

`hallazgos_por_qod_2026-08-14.txt`: el dataset aplica `severity > 0` sobre
`get_reports` con `filter='rows=1000'`, que conserva el QoD mínimo por defecto de gvmd
(70). En cada tarea, Greenbone registró además entre 91 y 117 resultados con
severidad > 0 y QoD 30 (detección por versión de banner, sin verificación activa),
con severidad máxima 10,0. Entre ellos están las vulnerabilidades de versión de
MySQL 5.7 en .13 y de Redis 5 en .21, en las cinco tareas. Los resultados
informativos (severidad 0) incluyen recursos SMB accesibles en .13, .17 y .20. El
NVT "Anonymous FTP Login Reporting" no aparece en ninguna tarea, aunque .19 y .21
configuran vsftpd con acceso anónimo; la causa no se diagnosticó.

El dataset tampoco incluye 30 resultados con severidad > 0 y QoD ≥ 70 que gvmd
registra para la campaña: 138 en la base frente a 108 en el dataset (7, 6, 5, 5 y 7
por tarea). Son dos NVT, "Weak MAC Algorithm(s) Supported (SSH)" (2,6) en cada activo
con SSH analizado y "SSL/TLS: Deprecated TLSv1.0 and TLSv1.1 Protocol Detection"
(4,3) en .13 (`hallazgos_omitidos_por_parser_2026-08-14.txt`). Ambos NVT se
modificaron en el feed antes de la campaña, así que no es un cambio posterior de
severidad. La causa es un error de parseo: los dos traen un bloque `<detection>` con
un `<result>` anidado antes de `<severity>`, y la regex no codiciosa de
`getReportSummary` cortaba el resultado en ese cierre interno, leía severidad 0 y lo
descartaba. Se corrigió en `docs/run_experiment.js` y `docs/reextract_findings.js`
(prueba: `docs/test_gmp_results_parsing.js`). El dataset no se regeneró: gvmd ya no
entrega por GMP los reportes de las tareas que están en la papelera. Ninguno de los
dos NVT es específico de una condición desplegada del Anexo F, así que el recall de
1/18 no cambia.

## NmapScan en el commit de la campaña

`e2e_nmapscan_47ff2f4_2026-09-30.txt`: la prueba de extremo a extremo del commit
`47ff2f4`, re-ejecutada el 30/09/2026 con los nodos `NmapScan` y `Code` de ese mismo
commit, clasifica los 12 activos igual que el Anexo F, incluido 172.20.0.10. El
error que omitió .10 en la campaña está en el parser de `docs/run_experiment.js`,
no en ese nodo. La regex que dejó a `NmapScan` sin detectar hosts se introdujo
después, en `3b7a3b6` (15/09), y se corrigió en `4cf0dba`.
