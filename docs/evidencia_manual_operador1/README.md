# Evidencia del brazo manual — operador 1

Repetición 1 de `docs/manual_arm_results.jsonl` (18/09/2026, 17:57–19:07 UTC).

`gvm_reports_rep1.txt` es la consulta a la tabla `reports` de gvmd (contenedor
`pg-gvm` del laboratorio) para esa ventana. Muestra que el operador lanzó las
9 tasks Alto/Crítico en paralelo, entre 18:22:58 y 18:24:23 UTC, y que todas
terminaron entre 18:35 y 18:52 (el .17 se relanzó a las 18:40). Esa
estrategia en paralelo, frente a la serie del operador 2
(`docs/evidencia_manual_operador2/`), explica la mayor parte de la diferencia
en la fase GVM entre ambas repeticiones.

Consulta usada:

```sql
select t.name, tg.hosts, r.uuid,
       to_timestamp(r.start_time) at time zone 'UTC',
       to_timestamp(r.end_time)   at time zone 'UTC',
       round((r.end_time - r.start_time) / 60.0, 1)
from reports r join tasks t on t.id = r.task
left join targets tg on tg.id = t.target
where r.start_time between extract(epoch from timestamp '2026-09-18 17:50')
                       and extract(epoch from timestamp '2026-09-18 19:10')
order by r.start_time;
```

El operador hizo una sesión de práctica previa no medida y reiniciaba la
repetición desde T0 ante un error; el registro corresponde a la corrida limpia.

## Clasificación registrada por el operador (T1–T2)

12 de 12 activos clasificados, coincidente con el Anexo F (puntaje entre paréntesis):

| Categoría | Activos |
|---|---|
| Normal | .10 (80, 443) · .11 (80) · .18 (8080) |
| Alto | .12 (22, 80 = 14) · .14 (22, 5432 = 20) · .15 (80, 389 = 12) · .16 (22, 25, 587 = 17) · .19 (21, 22 = 16) · .20 (22, 445 = 17) |
| Crítico | .13 (22, 445, 3306 = 28) · .17 (23, 445, 161/udp = 26) · .21 (21, 80, 6379 = 23) |

Los 9 activos Alto/Crítico se enviaron a Greenbone ("Full and fast"). Severidad
máxima por activo: .12, .13, .14, .16, .19 y .20 = 10.0; .15 = 5.0; .17 = 2.6; .21 = 7.5.

## Resultados publicados (severidad > 0 y QoD ≥ 70)

`hallazgos_qod70_rep1.txt` es la consulta a gvmd con el mismo filtro que la campaña
automatizada: 37 resultados en los 9 activos, sin contar el primer intento de .17
(terminado a los 11,5 min y relanzado). Son los ocho NVT que gvmd registra para la
campaña (incluidos los dos que el dataset omitió, ver
`docs/evidencia_campana_gvm/README.md`) más "Operating System (OS) End of Life
(EOL) Detection" (10,0) en los seis activos Debian 11, cuyo soporte terminó el
31/08/2026.
