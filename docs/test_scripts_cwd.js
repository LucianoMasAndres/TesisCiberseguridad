// Verifica que los scripts de analisis funcionen desde cualquier directorio de
// trabajo y que analyze_results.js reproduzca exactamente docs/analysis_output.txt
// (la salida publicada que respalda las cifras del brazo automatizado).
//
// Uso (desde cualquier directorio): node docs/test_scripts_cwd.js

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOCS = __dirname;
const ROOT = path.join(DOCS, '..');
const EXPECTED = fs.readFileSync(path.join(DOCS, 'analysis_output.txt'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

for (const cwd of [ROOT, DOCS, os.tmpdir()]) {
  const r = spawnSync(process.execPath, [path.join(DOCS, 'analyze_results.js')], { cwd, encoding: 'utf8' });
  const out = (r.stdout || '').replace(/\r\n/g, '\n');
  check(`analyze_results.js desde ${cwd}`, r.status === 0 && out === EXPECTED,
    r.status !== 0 ? (r.stderr || '').split('\n').find((l) => l.includes('Error')) : 'la salida difiere de analysis_output.txt');

  const m = spawnSync(process.execPath, [path.join(DOCS, 'analyze_manual_arm.js')], { cwd, encoding: 'utf8' });
  check(`analyze_manual_arm.js desde ${cwd}`, m.status === 0, (m.stderr || '').trim());
}

// Con operadores de estrategias distintas (paralelo contra serie), la tesis no
// promedia: el script tampoco tiene que publicar una media agrupada.
{
  const m = spawnSync(process.execPath, [path.join(DOCS, 'analyze_manual_arm.js')], { encoding: 'utf8' });
  const out = m.stdout || '';
  check('analyze_manual_arm.js no publica media agrupada entre operadores', !/media=/.test(out), 'la salida contiene "media="');
  check('analyze_manual_arm.js reporta cada operador por separado', /Operador 1/.test(out) && /Operador 2/.test(out), 'faltan filas por operador');
}

// Con un unico operador, en cambio, la media si se calcula.
{
  const tmp = path.join(os.tmpdir(), `manual_arm_un_operador_${process.pid}.jsonl`);
  const rec = (rep, total) => JSON.stringify({
    repeticion: rep, operador: 1, test: false,
    fases_seg: { nmap_s: 60, clasificacion_s: 60, gvm_reporte_s: total - 120, total_s: total },
    fases_fmt: { nmap: '1:00', clasificacion: '1:00', gvm_reporte: '-', total: '-' },
  });
  fs.writeFileSync(tmp, `${rec(1, 1000)}\n${rec(2, 1200)}\n`);
  const m = spawnSync(process.execPath, [path.join(DOCS, 'analyze_manual_arm.js'), tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  check('analyze_manual_arm.js con un operador calcula la media (1100 s)', /Manual total\s+media=18:20 \(1100\.0 s\)/.test(m.stdout || ''), (m.stdout || m.stderr || '').trim().split('\n').pop());
}

// La reduccion simetrica del ciclo (Tabla 2) se calcula sobre segundos crudos,
// no sobre los mm:ss redondeados: redaccion = T3 del operador 1 - fin del
// ultimo analisis en gvmd (docs/evidencia_manual_operador1/gvm_reports_rep1.txt),
// y media automatizada sin la repeticion 4 (docs/experiment_results.jsonl).
{
  const m = spawnSync(process.execPath, [path.join(DOCS, 'analyze_manual_arm.js')], { encoding: 'utf8' });
  const out = m.stdout || '';
  check('analyze_manual_arm.js mide la redaccion del operador 1 (951.8 s)', /redaccion medida: 951\.8 s/.test(out),
    out.split('\n').find((l) => /redaccion/.test(l)) || 'sin linea de redaccion');
  check('analyze_manual_arm.js: reduccion simetrica del operador 1 = 45.5 % (segundos crudos)',
    /Operador 1: 3263\.9 s -> 45\.5 %/.test(out), out.split('\n').find((l) => /Operador 1:/.test(l)) || 'sin linea');
  check('analyze_manual_arm.js: reduccion simetrica del operador 2 = 85.4 %',
    /Operador 2: 12189\.8 s -> 85\.4 %/.test(out), out.split('\n').find((l) => /Operador 2:/.test(l)) || 'sin linea');
}

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
