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

`docs/run_experiment.js` en el commit `47ff2f4` (14/08/2026, confirmado después de
terminar la campaña) es la versión usada, **con una diferencia**: la consulta
`get_reports` con `filter='rows=1000'` se agregó después de la corrida. Por eso
`experiment_log.txt` registra "0 hallazgos" en cada repetición: la versión que corrió
leía solo la primera página del reporte. Los hallazgos del dataset se extrajeron
después, sobre los mismos reportes, con `docs/reextract_findings.js` (incluido en el
mismo commit). Las demás diferencias con la versión actual del script (regex de
descubrimiento, paginación de `get_tasks`, extracción de CVE por `<refs>`, peso 11)
son posteriores a la campaña y no afectan sus datos. El campo `cve` del dataset quedó
vacío en los 108 hallazgos porque la extracción por `<refs>` no se volvió a correr
sobre él.
