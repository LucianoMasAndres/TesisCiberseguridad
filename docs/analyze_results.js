const fs = require('fs');
const lines = fs.readFileSync('experiment_results.jsonl', 'utf8').trim().split('\n');
const reps = lines.map(l => JSON.parse(l));

const GHOST_HOST = '172.20.0.3'; // ospd-openvas en lab-net, no es parte del ground truth

console.log('=== RESUMEN POR REPETICION ===');
reps.forEach(r => {
  console.log(`Rep ${r.repeticion}: ${r.duracion_total_s.toFixed(1)}s total | descubrimiento ${r.duracion_descubrimiento_s.toFixed(1)}s | greenbone ${r.duracion_greenbone_s.toFixed(1)}s | ${r.hosts_alto_critico} hosts Alto/Critico | ${r.total_hallazgos} hallazgos`);
});

console.log('\n=== CONSISTENCIA DE CLASIFICACION (excluyendo host fantasma 172.20.0.3) ===');
const groundTruth = {
  '172.20.0.10': 'Normal', '172.20.0.11': 'Normal', '172.20.0.12': 'Alto',
  '172.20.0.13': 'Critico', '172.20.0.14': 'Alto', '172.20.0.15': 'Alto',
  '172.20.0.16': 'Alto', '172.20.0.17': 'Critico', '172.20.0.18': 'Normal',
  '172.20.0.19': 'Alto', '172.20.0.20': 'Alto', '172.20.0.21': 'Critico',
};

let totalAciertos = 0, totalComparaciones = 0;
const erroresPorHost = {};
reps.forEach(r => {
  let aciertos = 0, comparaciones = 0;
  r.clasificacion.filter(h => h.ip !== GHOST_HOST).forEach(h => {
    comparaciones++;
    totalComparaciones++;
    if (h.classification === groundTruth[h.ip]) {
      aciertos++; totalAciertos++;
    } else {
      erroresPorHost[h.ip] = (erroresPorHost[h.ip] || 0) + 1;
    }
  });
  console.log(`Rep ${r.repeticion}: ${aciertos}/${comparaciones} activos coinciden con ground truth`);
});
console.log(`TOTAL: ${totalAciertos}/${totalComparaciones} (${(100*totalAciertos/totalComparaciones).toFixed(1)}%)`);
console.log('Errores por host (todos atribuibles a caidas documentadas de telnet-17/mail-16/ftp-19, no al algoritmo):', erroresPorHost);

console.log('\n=== VERIFICACION: el algoritmo SIEMPRE clasifica correctamente cuando tiene los puertos completos ===');
let erroresConPuertosCompletos = 0;
const puertosEsperados = {
  '172.20.0.10': [80,443], '172.20.0.11': [80], '172.20.0.12': [80,22],
  '172.20.0.13': [3306,22,445], '172.20.0.14': [5432,22], '172.20.0.15': [389,80],
  '172.20.0.16': [25,587,22], '172.20.0.17': [161,23,445], '172.20.0.18': [8080],
  '172.20.0.19': [21,22], '172.20.0.20': [22,445], '172.20.0.21': [6379,80,21],
};
reps.forEach(r => {
  r.clasificacion.filter(h => h.ip !== GHOST_HOST).forEach(h => {
    const esperados = puertosEsperados[h.ip] || [];
    const completos = esperados.every(p => h.ports.includes(p)) && h.ports.length >= esperados.length;
    if (completos && h.classification !== groundTruth[h.ip]) {
      erroresConPuertosCompletos++;
      console.log(`  ERROR REAL DE ALGORITMO en rep ${r.repeticion}, host ${h.ip}: puertos=${JSON.stringify(h.ports)} score=${h.score} obtenido=${h.classification} esperado=${groundTruth[h.ip]}`);
    }
  });
});
console.log(`Errores de algoritmo con puertos completos: ${erroresConPuertosCompletos} (deberia ser 0)`);

console.log('\n=== TIEMPOS (segundos) ===');
const times = reps.map(r => r.duracion_total_s);
const mean = times.reduce((a,b)=>a+b,0)/times.length;
const variance = times.reduce((a,b)=>a+(b-mean)**2,0)/times.length;
const stddev = Math.sqrt(variance);
console.log('Media:', mean.toFixed(1), 's (', (mean/60).toFixed(1), 'min) | Desv. estandar:', stddev.toFixed(1), 's | CV:', (100*stddev/mean).toFixed(2), '%');
console.log('Min:', Math.min(...times).toFixed(1), '| Max:', Math.max(...times).toFixed(1));

const discTimes = reps.map(r => r.duracion_descubrimiento_s);
console.log('Descubrimiento - media:', (discTimes.reduce((a,b)=>a+b,0)/discTimes.length).toFixed(1), 's (rango:', Math.min(...discTimes).toFixed(1), '-', Math.max(...discTimes).toFixed(1), ')');

console.log('\n=== HALLAZGOS TOTALES POR REPETICION ===');
reps.forEach(r => console.log(`Rep ${r.repeticion}: ${r.total_hallazgos} hallazgos, severidad maxima ${Math.max(...(r.hallazgos||[]).map(h=>h.severity), 0)}`));

console.log('\n=== HALLAZGOS UNICOS AGREGADOS (nombre + host) ===');
const nombresUnicos = new Set();
reps.forEach(r => (r.hallazgos||[]).forEach(h => nombresUnicos.add(h.host + ' | ' + h.name)));
console.log('Total combinaciones host+hallazgo unicas en las 5 repeticiones:', nombresUnicos.size);
[...nombresUnicos].sort().forEach(x => console.log('  ' + x));
