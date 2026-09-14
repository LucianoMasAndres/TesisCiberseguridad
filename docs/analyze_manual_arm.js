// Analiza docs/manual_arm_results.jsonl (generado por docs/manual_arm_log.js)
// y reproduce la fila "Manual" de la Tabla 4, con media y desviacion estandar
// poblacional por fase (mismo criterio descriptivo que docs/analyze_results.js
// usa para el brazo automatizado).
//
// Uso: node docs/analyze_manual_arm.js

const fs = require('fs');
const path = require('path');

const RESULTS_PATH = path.join(__dirname, 'manual_arm_results.jsonl');

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
  console.log('Rep. | Nmap    | Clasif. | GVM+reporte | Total');
  console.log('-----|---------|---------|-------------|-------');
  for (const r of registros) {
    console.log(
      `${String(r.repeticion).padStart(4)} | ${r.fases_fmt.nmap.padStart(7)} | ${r.fases_fmt.clasificacion.padStart(7)} | ${r.fases_fmt.gvm_reporte.padStart(11)} | ${r.fases_fmt.total}`
    );
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
