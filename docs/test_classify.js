const { classifyAsset } = require('./classify_asset');

const casos = [
  { ip: '172.20.0.10', puertos: [80, 443], esperado: 'Normal' },
  { ip: '172.20.0.11', puertos: [80], esperado: 'Normal' },
  { ip: '172.20.0.12', puertos: [80, 22], esperado: 'Alto' },
  { ip: '172.20.0.13', puertos: [3306, 22, 445], esperado: 'Critico' },
  { ip: '172.20.0.14', puertos: [5432, 22], esperado: 'Alto' },
  { ip: '172.20.0.15', puertos: [389, 80], esperado: 'Alto' },
  { ip: '172.20.0.16', puertos: [25, 587, 22], esperado: 'Alto' },
  { ip: '172.20.0.17', puertos: [161, 23, 445], esperado: 'Critico' },
  { ip: '172.20.0.18', puertos: [8080], esperado: 'Normal' },
  { ip: '172.20.0.19', puertos: [21, 22], esperado: 'Alto' },
  { ip: '172.20.0.20', puertos: [22, 445], esperado: 'Alto' },
  { ip: '172.20.0.21', puertos: [6379, 80, 21], esperado: 'Critico' },
];

let fallos = 0;
const conteo = { Normal: 0, Alto: 0, Critico: 0 };
let maxScore = 0;

for (const caso of casos) {
  const { classification, score } = classifyAsset(caso.puertos);
  const ok = classification === caso.esperado;
  if (!ok) fallos++;
  conteo[classification]++;
  if (score > maxScore) maxScore = score;
  console.log(`${caso.ip}: score=${score} clase=${classification} esperado=${caso.esperado} ${ok ? 'OK' : 'FALLO'}`);
}

console.log('---');
console.log(`Distribucion: Normal=${conteo.Normal} Alto=${conteo.Alto} Critico=${conteo.Critico} (total=${casos.length})`);
console.log(`Score maximo del laboratorio: ${maxScore} (umbral Critico: >20)`);
console.log('---');
console.log(fallos === 0 ? 'TODOS LOS CASOS PASAN' : `${fallos} CASOS FALLARON`);
process.exit(fallos === 0 ? 0 : 1);
