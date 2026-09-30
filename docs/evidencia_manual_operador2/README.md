# Evidencia del brazo manual — operador 2

Repetición 2 de `docs/manual_arm_results.jsonl` (24/09/2026, 16:53–20:32 UTC).
Registrada con `docs/cronometro_manual.py` en la máquina del operador 2 (su
propia instancia del laboratorio, por eso estos scans no figuran en la base
gvmd del operador 1).

## Condiciones de la repetición

- **Greenbone en serie**: un Target + Task ("Full and fast") por host, lanzando
  el siguiente recién al terminar el anterior. El operador 1 (repetición 1)
  lanzó las 9 tasks en paralelo (ver `docs/evidencia_manual_operador1/`). La
  guía (`docs/guia_repeticion_manual.md` §4) no fijaba ninguna de las dos
  estrategias; esa ambigüedad explica la mayor parte de la diferencia en la
  fase GVM (206:01 contra 55:58).
- **Sin sesión de práctica y sin reinicios**: corrida continua; los errores se
  corrigieron sobre la marcha o no se detectaron. El operador 1 hizo una
  práctica previa no medida y reiniciaba la repetición desde T0 ante errores.

## Error de operador en 172.20.0.19

Al crear el Target del host .19 el operador ingresó `170.20.0.19` en lugar de
`172.20.0.19` (declaración del operador). El reporte resultante
(`report_19_rep1_TYPO_170vs172.xml`, task `0622bc96-215c-4a82-a1ab-3bb292c594ac`,
nombre `manual-rep1-19`, 24/09 19:25–19:26 UTC) registra 0 hosts escaneados y 0
resultados. El XML prueba el scan vacío; la IP tipeada no queda registrada en
el reporte, de modo que ese dato proviene del operador. El error no se detectó
durante la repetición: la cobertura efectiva de GVM fue de 7 de 8 hosts
Alto/Crítico, y el tiempo de esa fase no incluye el análisis de .19 (≈22 min
en la repetición 1), por lo que subestima el costo de un ciclo completo.

## Contenido

- `report_19_rep1_TYPO_170vs172.xml`: reporte GMP del scan vacío de .19.
- `exports_gsa_rep2/`: resultados exportados desde GSA para los 7 hosts
  escaneados (.12 .13 .14 .15 .17 .20 .21), sin editar.
- `corridas_excluidas.jsonl`: dos corridas posteriores del operador 2 (25/09)
  **excluidas del brazo manual** porque la fase GVM la ejecutó un script vía
  GMP (`manual_seq_gvm.js`), no un operador humano. Se conservan solo como
  registro; no entran en `analyze_manual_arm.js`.

Las notas de `corridas_excluidas.jsonl` mencionan `manual_seq_gvm.js` y
`rep3_live_gvm.log`: son archivos del equipo del operador 2 y no se publican,
porque esas corridas no forman parte del brazo manual.
