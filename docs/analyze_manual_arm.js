// Analiza docs/manual_arm_results.jsonl (generado por docs/manual_arm_log.js o
// por docs/cronometro_manual.py, mismo esquema de salida en ambos casos)
// y lista cada repeticion con su operador. Si todas son del mismo operador,
// agrega media y desviacion estandar poblacional por fase (mismo criterio
// descriptivo que docs/analyze_results.js usa para el brazo automatizado); si
// hay operadores con condiciones distintas, no las promedia.
//
// Uso: node docs/analyze_manual_arm.js [ruta/a/registros.jsonl]

const fs = require('fs');
const path = require('path');

// Opcional: ruta a otro archivo de registros como primer argumento (lo usan los tests).
const RESULTS_PATH = process.argv[2] || path.join(__dirname, 'manual_arm_results.jsonl');

function fmtMinSec(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function meanStd(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`No existe ${RESULTS_PATH} todavia.`);
    console.error('Corre primero: node docs/manual_arm_log.js --rep 1');
    process.exit(1);
  }

  const lines = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const registros = lines.map((l) => JSON.parse(l)).filter((r) => !r.test);

  if (registros.length === 0) {
    console.error('El archivo solo tiene registros de --test (test:true). No hay repeticiones reales.');
    process.exit(1);
  }

  console.log(`Repeticiones reales encontradas: ${registros.length}`);
  console.log('');
  console.log('Rep. | Operador   | Nmap    | Clasif. | GVM+reporte | Total');
  console.log('-----|------------|---------|---------|-------------|-------');
  for (const r of registros) {
    const op = r.operador !== undefined ? `Operador ${r.operador}` : '-';
    console.log(
      `${String(r.repeticion).padStart(4)} | ${op.padEnd(10)} | ${r.fases_fmt.nmap.padStart(7)} | ${r.fases_fmt.clasificacion.padStart(7)} | ${r.fases_fmt.gvm_reporte.padStart(11)} | ${r.fases_fmt.total}`
    );
  }

  // Repeticiones de operadores distintos no se promedian: en la remedicion de
  // septiembre de 2026 el operador 1 lanzo Greenbone en paralelo y el operador 2
  // en serie, dos estrategias distintas (ver docs/evidencia_manual_operador*/).
  // Una media agrupada no describiria a ningun operador real.
  const operadores = new Set(registros.map((r) => r.operador));
  if (operadores.size > 1) {
    console.log(`\nRepeticiones de ${operadores.size} operadores con condiciones distintas (ver campo "nota"):`);
    console.log('no se calcula media agrupada. Cada fila se reporta por separado.');
    for (const r of registros) {
      if (r.nota) console.log(`  Rep. ${r.repeticion} (Operador ${r.operador}): ${r.nota}`);
    }
    return;
  }

  const fases = ['nmap_s', 'clasificacion_s', 'gvm_reporte_s', 'total_s'];
  const etiquetas = { nmap_s: 'Manual Nmap', clasificacion_s: 'Manual clasif.', gvm_reporte_s: 'Manual GVM + reporte', total_s: 'Manual total' };

  console.log('\n--- Media y desviacion estandar (poblacional) ---');
  for (const fase of fases) {
    const valores = registros.map((r) => r.fases_seg[fase]);
    const { mean, std } = meanStd(valores);
    const cv = (100 * std) / mean;
    console.log(
      `${etiquetas[fase].padEnd(22)} media=${fmtMinSec(mean)} (${mean.toFixed(1)} s)  desv.est=${std.toFixed(1)} s  CV=${cv.toFixed(2)} %`
    );
  }

  if (registros.length < 5) {
    console.log(`\nNota: n=${registros.length}. La campana automatizada usa n=5 (4 validas, ver §5.3).`);
    console.log('Si se publica con menos repeticiones que el brazo automatizado, declararlo explicitamente en el capitulo de resultados.');
  }
}

main();
