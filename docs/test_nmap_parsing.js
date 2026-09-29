// Test unitario del parseo de XML de Nmap, sin laboratorio: ejecuta el codigo
// del nodo NmapScan (workflows/workflowV4_windows.json) y la funcion
// runDiscoveryAndPortScan de docs/run_experiment.js con un execSync simulado
// que devuelve salidas reales de nmap capturadas del laboratorio
// (docs/fixtures/). Cubre los dos formatos de <host> que emite nmap:
//   - descubrimiento (-sn): "<host>" sin atributos
//   - escaneo de puertos: "<host starttime=...>" precedido de bloques
//     "<hosthint>" que NO deben confundirse con un host real.
//
// Uso (desde cualquier directorio): node docs/test_nmap_parsing.js

const fs = require('fs');
const path = require('path');

const FIXTURES = path.join(__dirname, 'fixtures');
const DISCOVERY_XML = fs.readFileSync(path.join(FIXTURES, 'nmap_discovery_sn.xml'), 'utf8');
const PORTSCAN_XML = fs.readFileSync(path.join(FIXTURES, 'nmap_portscan_multi.xml'), 'utf8');

const LAB_IPS = Array.from({ length: 12 }, (_, i) => `172.20.0.${10 + i}`);
const EXPECTED_PORTS = {
  '172.20.0.10': [80, 443],
  '172.20.0.13': [22, 445, 3306],
  '172.20.0.17': [23, 161, 445],
  '172.20.0.21': [21, 80, 6379],
};

// execSync simulado: -sn devuelve el descubrimiento, el resto el escaneo de
// puertos. Registra las IPs pasadas al escaneo de puertos.
function makeFakeChildProcess(calls) {
  return {
    execSync(cmd) {
      calls.push(cmd);
      return Buffer.from(cmd.includes(' -sn ') ? DISCOVERY_XML : PORTSCAN_XML);
    },
  };
}

function fakeRequire(calls) {
  return (mod) => (mod === 'child_process' ? makeFakeChildProcess(calls) : require(mod));
}

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

function checkHosts(label, hosts, calls) {
  const portScanCmd = calls.find((c) => !c.includes(' -sn ')) || '';
  const scanned = LAB_IPS.filter((ip) => portScanCmd.includes(ip));
  check(`${label}: el descubrimiento encuentra los 12 activos`, scanned.length === 12,
    `IPs enviadas al escaneo de puertos: ${scanned.length}`);
  check(`${label}: el hosthint no se confunde con un host (4 hosts)`, hosts.length === 4,
    `hosts parseados: ${JSON.stringify(hosts.map((h) => h.ip))}`);
  for (const [ip, expected] of Object.entries(EXPECTED_PORTS)) {
    const h = hosts.find((x) => x.ip === ip);
    const got = h ? [...h.ports].sort((a, b) => a - b) : null;
    check(`${label}: puertos de ${ip}`, JSON.stringify(got) === JSON.stringify(expected),
      `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(got)}`);
  }
}

// 1. Nodo NmapScan del workflow V4 (el codigo tal como esta en el JSON)
{
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'workflowV4_windows.json'), 'utf8'));
  const code = wf.nodes.find((n) => n.name === 'NmapScan').parameters.jsCode;
  const calls = [];
  const fn = new Function('items', 'require', `return (function(){${code}})()`);
  const out = fn([{}], fakeRequire(calls));
  checkHosts('NmapScan (V4)', out[0].json.hosts, calls);
}

// 2. runDiscoveryAndPortScan de docs/run_experiment.js
{
  const calls = [];
  const cp = require('child_process');
  const original = cp.execSync;
  cp.execSync = makeFakeChildProcess(calls).execSync;
  try {
    const { runDiscoveryAndPortScan } = require('./run_experiment.js');
    checkHosts('run_experiment.js', runDiscoveryAndPortScan(), calls);
  } finally {
    cp.execSync = original;
  }
}

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
