// Orquestador del experimento real (Bloque 1, tarea 5): dispara N repeticiones
// del pipeline automatizado via webhook con el perfil de escaneo real ("Full
// and fast"), espera a que Greenbone termine consultando GMP, y registra por
// repeticion: hitos de tiempo, clasificacion de activos y hallazgos por host.
//
// Corre DENTRO del contenedor n8n-security-lab:
//   docker exec -u node n8n-security-lab node /tmp/run_experiment.js > /tmp/experiment_log.jsonl 2>&1 &

const { execSync } = require('child_process');
const fs = require('fs');

const REPETICIONES = 5;
const SCAN_CONFIG_FULL_AND_FAST = 'daba56c8-73ec-11df-a475-002264764cea';
const GVM_CLI = '/home/node/gvm-env/bin/gvm-cli --gmp-username admin --gmp-password admin123 socket --socketpath /run/gvmd/gvmd.sock';
const RESULTS_PATH = '/tmp/experiment_results.jsonl';
const SERVICE_WEIGHTS = {
  21: 7, 22: 9, 23: 12, 25: 4, 80: 5, 161: 6, 389: 7, 443: 4,
  445: 8, 587: 4, 3306: 10, 5432: 10, 6379: 10, 8080: 5,
};

function classify(ports) {
  const score = (ports || []).reduce((s, p) => s + (SERVICE_WEIGHTS[p] || 1), 0);
  const classification = score > 20 ? 'Critico' : score > 10 ? 'Alto' : 'Normal';
  return { score, classification };
}

function nowIso() { return new Date().toISOString(); }
function log(msg) { console.log(`[${nowIso()}] ${msg}`); }

function gmp(xml) {
  const cmd = `${GVM_CLI} --xml "${xml.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { maxBuffer: 1024 * 1024 * 50 }).toString();
}

function runDiscoveryAndPortScan() {
  const subnet = '172.20.0.0/24';
  const relevantPorts = 'T:21,22,23,25,80,389,443,445,587,3306,5432,6379,8080,U:161';
  const discoveryXml = execSync(`nmap -sn -n -oX - ${subnet}`, { maxBuffer: 1024 * 1024 * 20 }).toString();
  const discBlocks = discoveryXml.match(/<host[\s\S]*?<\/host>/g) || [];
  // Excluye infraestructura de la propia red lab-net que no es parte del
  // ground truth: gateway/reservados (.1, .2) y el contenedor ospd-openvas
  // que se une a lab-net para poder escanear (.3, ver docs/anexo_e_f_v2.md).
  // Bug real detectado en las repeticiones 1 y 5 del experimento: sin este
  // filtro, .3 aparecia como un "13er host fantasma" clasificado Normal.
  const ignoradas = ['172.20.0.1', '172.20.0.2', '172.20.0.3'];
  const upIps = [];
  for (const block of discBlocks) {
    if (/<status state="up"/.test(block)) {
      const m = block.match(/addr="([\d.]+)" addrtype="ipv4"/);
      if (m && !ignoradas.includes(m[1])) upIps.push(m[1]);
    }
  }
  const ipsArg = upIps.join(' ');
  const portScanXml = execSync(
    `nmap -n -Pn --open -p ${relevantPorts} -sS -sU -sV -oX - ${ipsArg}`,
    { maxBuffer: 1024 * 1024 * 20 }
  ).toString();
  const hosts = [];
  const psBlocks = portScanXml.match(/<host[\s\S]*?<\/host>/g) || [];
  for (const block of psBlocks) {
    const ipMatch = block.match(/addr="([\d.]+)" addrtype="ipv4"/);
    if (!ipMatch) continue;
    const ip = ipMatch[1];
    const ports = [];
    const portBlocks = block.match(/<port protocol="(?:tcp|udp)" portid="\d+">[\s\S]*?<\/port>/g) || [];
    for (const pb of portBlocks) {
      const stateMatch = pb.match(/<state state="open"/);
      const portIdMatch = pb.match(/portid="(\d+)"/);
      if (stateMatch && portIdMatch) ports.push(parseInt(portIdMatch[1], 10));
    }
    hosts.push({ ip, ports });
  }
  return hosts;
}

function findNewestTaskSince(sinceIsoMinusSlack) {
  const xml = gmp('<get_tasks/>');
  const blocks = xml.match(/<task id="[^"]*">[\s\S]*?<\/task>/g) || [];
  let newest = null;
  for (const block of blocks) {
    const idMatch = block.match(/<task id="([^"]+)">/);
    const ctMatch = block.match(/<creation_time>([^<]+)<\/creation_time>/);
    if (!idMatch || !ctMatch) continue;
    const created = new Date(ctMatch[1]);
    if (created >= sinceIsoMinusSlack) {
      if (!newest || created > newest.created) {
        newest = { id: idMatch[1], created, block };
      }
    }
  }
  return newest;
}

function getTaskStatus(taskId) {
  const xml = gmp(`<get_tasks task_id='${taskId}'/>`);
  const statusMatch = xml.match(/<status>([^<]+)<\/status>/);
  const reportIdMatch = xml.match(/<last_report><report id="([^"]+)">/);
  return {
    status: statusMatch ? statusMatch[1] : 'Unknown',
    reportId: reportIdMatch ? reportIdMatch[1] : null,
    raw: xml,
  };
}

function getReportSummary(reportId) {
  // Bug corregido: get_reports pagina a 10 resultados por defecto (filtro
  // "rows=10" implicito). Sin filter=rows explicito, cualquier reporte con
  // mas de 10 hallazgos deja los reales fuera de la pagina y el resumen da
  // 0 aunque el escaneo si encontro vulnerabilidades (visto en la repeticion
  // 1: GMP reportaba severity=7.5 en get_tasks pero este parser extraia 0).
  // Ademas, <host> tiene hijos anidados (<asset/>, <hostname/>) antes del
  // cierre </host>, asi que el regex de host no debia exigir el cierre
  // inmediato.
  const xml = gmp(`<get_reports report_id='${reportId}' details='1' filter='rows=1000'/>`);
  const results = xml.match(/<result id="[^"]*">[\s\S]*?<\/result>/g) || [];
  const findings = results.map(r => {
    const host = (r.match(/<host>([^<]*)/) || [])[1] || 'desconocido';
    const name = (r.match(/<name>([^<]*)<\/name>/) || [])[1] || '';
    const severity = parseFloat((r.match(/<severity>([^<]*)<\/severity>/) || [])[1] || '0');
    const cve = (r.match(/<cve>([^<]*)<\/cve>/) || [])[1] || '';
    const port = (r.match(/<port>([^<]*)<\/port>/) || [])[1] || '';
    return { host, name, severity, cve, port };
  }).filter(f => f.severity > 0);
  return { totalFindings: findings.length, findings };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runRepetition(n) {
  log(`===== REPETICION ${n}/${REPETICIONES}: inicio =====`);
  const t0 = new Date();

  log('T0->T1: descubrimiento + escaneo de puertos (nmap real)');
  const hosts = runDiscoveryAndPortScan();
  const t1 = new Date();

  const clasificados = hosts.map(h => ({ ip: h.ip, ports: h.ports, ...classify(h.ports) }));
  const objetivo = clasificados.filter(h => h.classification === 'Alto' || h.classification === 'Critico');
  log(`Clasificacion: ${clasificados.length} hosts descubiertos, ${objetivo.length} Alto/Critico enviados a Greenbone`);

  const payload = { hosts, subnet: '172.20.0.0/24', hostCount: hosts.length };
  fs.writeFileSync('/tmp/webhook_payload.json', JSON.stringify(payload));

  log('T1->T2: disparando webhook con perfil Full and fast');
  execSync(
    `wget -q -O - --header="Content-Type: application/json" --post-file=/tmp/webhook_payload.json "http://localhost:5678/webhook/nmap?scan_config=${SCAN_CONFIG_FULL_AND_FAST}"`
  ).toString();
  const t2 = new Date();

  await sleep(15000); // dar tiempo a que CreateTarget/CreateTask/StartTask corran
  const task = findNewestTaskSince(new Date(t0.getTime() - 5000));
  if (!task) {
    throw new Error('No se encontro la tarea recien creada en Greenbone');
  }
  log(`Tarea Greenbone: ${task.id}`);

  log('T2->T3: esperando a que Greenbone termine (polling cada 60s)...');
  let status = 'Unknown';
  let reportId = null;
  const maxWaitMs = 90 * 60 * 1000;
  const pollStart = Date.now();
  while (Date.now() - pollStart < maxWaitMs) {
    const st = getTaskStatus(task.id);
    status = st.status;
    reportId = st.reportId;
    if (status === 'Done') break;
    if (status === 'Stopped' || status === 'Interrupted') {
      throw new Error(`Tarea termino con estado inesperado: ${status}`);
    }
    await sleep(60000);
  }
  const t3 = new Date();

  if (status !== 'Done') {
    throw new Error(`Timeout esperando a que la tarea termine (ultimo estado: ${status})`);
  }

  const reportSummary = reportId ? getReportSummary(reportId) : { totalFindings: 0, findings: [] };

  const record = {
    repeticion: n,
    t0_inicio: t0.toISOString(),
    t1_descubrimiento_fin: t1.toISOString(),
    t2_webhook_disparado: t2.toISOString(),
    t3_greenbone_done: t3.toISOString(),
    duracion_descubrimiento_s: (t1 - t0) / 1000,
    duracion_greenbone_s: (t3 - t2) / 1000,
    duracion_total_s: (t3 - t0) / 1000,
    hosts_descubiertos: clasificados.length,
    hosts_alto_critico: objetivo.length,
    clasificacion: clasificados,
    task_id: task.id,
    report_id: reportId,
    total_hallazgos: reportSummary.totalFindings,
    hallazgos: reportSummary.findings,
  };

  fs.appendFileSync(RESULTS_PATH, JSON.stringify(record) + '\n');
  log(`===== REPETICION ${n}/${REPETICIONES}: fin (${record.duracion_total_s.toFixed(1)}s total, ${reportSummary.totalFindings} hallazgos) =====`);
  return record;
}

(async () => {
  fs.writeFileSync(RESULTS_PATH, ''); // reset del archivo de resultados
  const resumen = [];
  for (let n = 1; n <= REPETICIONES; n++) {
    try {
      const r = await runRepetition(n);
      resumen.push(r);
    } catch (e) {
      log(`ERROR en repeticion ${n}: ${e.message}`);
      fs.appendFileSync(RESULTS_PATH, JSON.stringify({ repeticion: n, error: e.message }) + '\n');
    }
  }
  log('===== EXPERIMENTO COMPLETO: 5 repeticiones procesadas =====');
  console.log('EXPERIMENT_DONE');
})();
