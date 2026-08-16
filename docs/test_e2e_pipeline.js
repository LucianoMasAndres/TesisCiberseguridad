// Test end-to-end REAL: ejecuta el codigo de los nodos NmapScan y Code tal como
// estan en workflows/workflowV4_windows.json, contra el laboratorio real de 12
// activos (lab-targets/docker-compose.lab-targets.yml). No es una simulacion:
// corre nmap de verdad contra contenedores de verdad.
//
// Requiere correrse DENTRO del contenedor n8n-security-lab (tiene nmap con el
// bit setuid, ver n8n_custom/Dockerfile, y esta conectado a la red lab-net):
//
//   docker cp workflows/workflowV4_windows.json n8n-security-lab:/tmp/workflowV4.json
//   docker exec -u node n8n-security-lab node /tmp/test_e2e_pipeline.js
//
// (o copiar tambien este archivo a /tmp dentro del contenedor)

const fs = require('fs');
const path = process.env.WORKFLOW_PATH || '/tmp/workflowV4.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

const nmapScanCode = wf.nodes.find(n => n.name === 'NmapScan').parameters.jsCode;
const classifyCode = wf.nodes.find(n => n.name === 'Code').parameters.jsCode;

console.log('=== Ejecutando NmapScan (nmap real contra lab-net) ===');
const nmapFn = new Function('items', 'process', 'require', 'return (function(){' + nmapScanCode + '})()');
const nmapResult = nmapFn([{}], process, require);
console.log(JSON.stringify(nmapResult[0].json, null, 2));

console.log('=== Ejecutando Code (clasificacion) sobre el resultado real de NmapScan ===');
const classifyFn = new Function('items', 'return (function(){' + classifyCode + '})()');
const classifyResult = classifyFn([{ json: nmapResult[0].json }]);
console.log(JSON.stringify(classifyResult[0].json, null, 2));

// Verificacion contra el ground truth (ver anexo_e_f_v2.md)
const esperado = {
  '172.20.0.10': 'Normal', '172.20.0.11': 'Normal', '172.20.0.12': 'Alto',
  '172.20.0.13': 'Critico', '172.20.0.14': 'Alto', '172.20.0.15': 'Alto',
  '172.20.0.16': 'Alto', '172.20.0.17': 'Critico', '172.20.0.18': 'Normal',
  '172.20.0.19': 'Alto', '172.20.0.20': 'Alto', '172.20.0.21': 'Critico',
};

let fallos = 0;
const clasif = classifyResult[0].json.clasificacion || [];
console.log('=== Verificacion contra ground truth ===');
for (const ip of Object.keys(esperado)) {
  const h = clasif.find(x => x.ip === ip);
  const obtenido = h ? h.classification : 'NO_DETECTADO';
  const ok = obtenido === esperado[ip];
  if (!ok) fallos++;
  console.log(`${ip}: esperado=${esperado[ip]} obtenido=${obtenido} ${ok ? 'OK' : 'FALLO'}`);
}
console.log(fallos === 0 ? '=== E2E TEST: PASA (pipeline real, nmap real, clasificacion real) ===' : `=== E2E TEST: ${fallos} FALLOS ===`);
process.exit(fallos === 0 ? 0 : 1);
