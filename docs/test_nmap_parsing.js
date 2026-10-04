// Test unitario del parseo de XML de Nmap, sin laboratorio: ejecuta el codigo
// del nodo NmapScan (workflows/workflowV4_windows.json) y la funcion
// runDiscoveryAndPortScan de docs/run_experiment.js con un child_process simulado
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

// child_process simulado: -sn devuelve el descubrimiento, el resto el escaneo
// de puertos. Registra las IPs pasadas al escaneo de puertos. El nodo NmapScan
// llama a execFile (asincronico, arreglo de argumentos); run_experiment.js, a
// execSync. Las variantes sincronicas se registran aparte para poder comprobar
// que NmapScan no las usa.
function makeFakeChildProcess(calls, syncCalls = []) {
  const execSync = (cmd) => {
    calls.push(cmd);
    syncCalls.push(cmd);
    return Buffer.from(cmd.includes(' -sn ') ? DISCOVERY_XML : PORTSCAN_XML);
  };
  return {
    execSync,
    execFileSync: (file, args) => execSync(`${file} ${args.join(' ')}`),
    execFile: (file, args, opts, cb) => {
      const cmd = `${file} ${args.join(' ')}`;
      calls.push(cmd);
      setImmediate(() => (cb || opts)(null, cmd.includes(' -sn ') ? DISCOVERY_XML : PORTSCAN_XML));
    },
  };
}

function fakeRequire(calls, syncCalls) {
  return (mod) => (mod === 'child_process' ? makeFakeChildProcess(calls, syncCalls) : require(mod));
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

(async () => {
// 1. Nodo NmapScan del workflow V4 (el codigo tal como esta en el JSON)
{
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'workflowV4_windows.json'), 'utf8'));
  const code = wf.nodes.find((n) => n.name === 'NmapScan').parameters.jsCode;
  const calls = [];
  const syncCalls = [];
  const fn = new Function('items', 'require', `return (async () => {${code}\n})()`);
  const out = await fn([{}], fakeRequire(calls, syncCalls));
  checkHosts('NmapScan (V4)', out[0].json.hosts, calls);
  // El escaneo de puertos del laboratorio tarda mas que el heartbeat del Task
  // Runner de n8n (N8N_RUNNERS_HEARTBEAT_INTERVAL=120 s). Una llamada sincronica
  // bloquea el event loop del runner, que deja de responder, y n8n aborta la
  // tarea ("runner became unresponsive").
  check('NmapScan (V4): nmap se invoca de forma asincronica (no bloquea el Task Runner)',
    calls.length === 2 && syncCalls.length === 0, `llamadas sincronicas: ${syncCalls.length} de ${calls.length}`);
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
})();
