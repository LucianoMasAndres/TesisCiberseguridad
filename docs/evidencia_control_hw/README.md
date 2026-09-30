# Corridas de control del brazo manual (19 y 20/08/2026)

Mismo host que la campaña automatizada del 14/08/2026. Ver el §5.1 de la tesis.

- `manual_timing_log.jsonl`: eventos de inicio y fin registrados automáticamente.
- `reporte_manual_control_hw_rep2.txt`: corrida (a), descubrimiento, puertos y
  clasificación de los 12 activos.
- `reporte_manual_control_hw_rep3_gvm.txt`: corrida (b), fase de Greenbone por
  línea de comandos sobre los 9 activos Alto/Crítico.

Notas de lectura:

- El cronómetro que citan los reportes (`manual_timer.sh`) no se publica en el
  repositorio; los tiempos publicados son los de `manual_timing_log.jsonl`.
- La corrida (b) produjo solo resultados de severidad 0,0: no detectó, por ejemplo,
  "Redis Server No Password", que la campaña del 14/08 detectó en las cinco
  repeticiones. Su duración no sirve como medida de equivalencia del motor.
- El reporte de la corrida (b) atribuye la diferencia de la fase de Greenbone al
  hardware. Esa lectura quedó descartada: la remedición del operador 1 (18/09, mismo
  host) muestra que la diferencia es el trabajo manual de configuración y redacción
  (ver `docs/evidencia_manual_operador1/`). Los reportes se conservan sin editar.
