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
