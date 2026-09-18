// Registro cronometrado del brazo manual (condicion de comparacion, Tabla 4 /
// Tabla 2). A diferencia del brazo automatizado (docs/run_experiment.js), esta
// condicion no se puede disparar por script: el operador ejecuta Nmap desde la
// terminal, clasifica los activos a mano, y opera la interfaz web de Greenbone
// a mano. Este script no automatiza esos pasos -- automatiza UNICAMENTE el
// registro de los timestamps de cada hito, para que la remedicion quede con
// bitacora real en el repositorio (ver hallazgo B2, ronda 10 de auditoria
// independiente: la campana manual original no dejo ningun registro crudo).
//
// RECOMENDADO: docs/cronometro_manual.py (Python) hace lo mismo pero cada
// hito se puede marcar solo (encadenando `python docs/marcar.py` al final
// del comando real) en vez de tener que volver a esta terminal y tocar
// ENTER. Mismo esquema de salida, ambos escriben en
// docs/manual_arm_results.jsonl y docs/analyze_manual_arm.js lee cualquiera
// de los dos sin cambios. Este archivo .js se deja como referencia / respaldo.
//
// Uso:
//   node docs/manual_arm_log.js --rep 1
//   node docs/manual_arm_log.js --rep 1 --test     (modo de prueba, sin input humano)
//
// El operador ejecuta el proceso real en paralelo y presiona ENTER en cada
// hito cuando corresponda. Cada corrida agrega UN registro JSON a
// docs/manual_arm_results.jsonl (no pisa registros anteriores).

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RESULTS_PATH = path.join(__dirname, 'manual_arm_results.jsonl');

const HITOS = [
  {
    key: 't0_inicio',
    prompt: 'T0 - Presiona ENTER justo antes de arrancar Nmap desde la terminal',
  },
  {
    key: 't1_fin_nmap',
    prompt: 'T1 - Presiona ENTER cuando termines Nmap Y el analisis visual del output (fin de "Manual Nmap")',
  },
  {
    key: 't2_fin_clasificacion',
    prompt: 'T2 - Presiona ENTER cuando termines de clasificar a mano los activos (fin de "Manual clasif.")',
  },
  {
    key: 't3_fin_gvm',
    prompt: 'T3 - Presiona ENTER cuando termines TODO el ciclo de Greenbone (config. target, lanzar, esperar, ver reporte) Y la redaccion del informe (fin de "Manual GVM + reporte")',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const args = { rep: null, test: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rep') args.rep = parseInt(argv[i + 1], 10);
    if (argv[i] === '--test') args.test = true;
  }
  return args;
}

function fmtMinSec(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function waitForEnter(rl, promptText) {
  return new Promise((resolve) => {
    rl.question(`\n${promptText}\n> `, () => resolve(nowIso()));
  });
}

async function waitForEnterOrAuto(rl, promptText, test) {
  if (test) {
    console.log(`\n${promptText}\n> [--test: avanzando automaticamente]`);
    await new Promise((r) => setTimeout(r, 300));
    return nowIso();
  }
  return waitForEnter(rl, promptText);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.rep) {
    console.error('Falta --rep <numero>. Ejemplo: node docs/manual_arm_log.js --rep 1');
    process.exit(1);
  }

  console.log('==============================================================');
  console.log(`  Registro manual del brazo comparativo -- Repeticion ${args.rep}`);
  console.log('==============================================================');
  console.log('Este script NO ejecuta nada por vos. Vos haces el proceso manual');
  console.log('real (Nmap por terminal, clasificacion a mano, Greenbone por la');
  console.log('interfaz web) y marcas cada hito con ENTER cuando corresponda.');
  if (args.test) console.log('\n[MODO --test: avanza solo, para validar el script, no genera dato real]');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const timestamps = {};
  for (const hito of HITOS) {
    timestamps[hito.key] = await waitForEnterOrAuto(rl, hito.prompt, args.test);
  }
  rl.close();

  const t0 = new Date(timestamps.t0_inicio).getTime();
  const t1 = new Date(timestamps.t1_fin_nmap).getTime();
  const t2 = new Date(timestamps.t2_fin_clasificacion).getTime();
  const t3 = new Date(timestamps.t3_fin_gvm).getTime();

  const fases_seg = {
    nmap_s: (t1 - t0) / 1000,
    clasificacion_s: (t2 - t1) / 1000,
    gvm_reporte_s: (t3 - t2) / 1000,
    total_s: (t3 - t0) / 1000,
  };

  const registro = {
    repeticion: args.rep,
    test: args.test,
    timestamps,
    fases_seg,
    fases_fmt: {
      nmap: fmtMinSec(fases_seg.nmap_s),
      clasificacion: fmtMinSec(fases_seg.clasificacion_s),
      gvm_reporte: fmtMinSec(fases_seg.gvm_reporte_s),
      total: fmtMinSec(fases_seg.total_s),
    },
    registrado_en: nowIso(),
  };

  fs.appendFileSync(RESULTS_PATH, JSON.stringify(registro) + '\n');

  console.log('\n--- Resumen de la repeticion', args.rep, '---');
  console.log('Manual Nmap:        ', registro.fases_fmt.nmap, 'min');
  console.log('Manual clasif.:     ', registro.fases_fmt.clasificacion, 'min');
  console.log('Manual GVM + reporte:', registro.fases_fmt.gvm_reporte, 'min');
  console.log('Manual total:       ', registro.fases_fmt.total, 'min');
  console.log(`\nRegistro agregado a ${RESULTS_PATH}`);
  if (args.test) {
    console.log('(Este fue un registro de --test. Si no queres que cuente como');
    console.log(' repeticion real, borralo de manual_arm_results.jsonl antes de');
    console.log(' correr la primera repeticion real con el mismo numero.)');
  }
}

main();
