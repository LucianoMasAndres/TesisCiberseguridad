// Re-extrae los hallazgos reales de las repeticiones ya completadas en
// experiment_results.jsonl usando la logica de parseo corregida (ver
// run_experiment.js), sin necesidad de volver a correr el escaneo. Corre
// DENTRO del contenedor n8n-security-lab:
//   docker exec -u node n8n-security-lab node /tmp/reextract_findings.js

const { execSync } = require('child_process');
const fs = require('fs');

const GVM_CLI = '/home/node/gvm-env/bin/gvm-cli --gmp-username admin --gmp-password admin123 socket --socketpath /run/gvmd/gvmd.sock';
const RESULTS_PATH = '/tmp/experiment_results.jsonl';

function gmp(xml) {
  const cmd = `${GVM_CLI} --xml "${xml.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { maxBuffer: 1024 * 1024 * 50 }).toString();
}

function getReportSummary(reportId) {
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

const lines = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean);
const fixed = lines.map(line => {
  const record = JSON.parse(line);
  if (record.error || !record.report_id) return record;
  console.log(`Re-extrayendo repeticion ${record.repeticion} (report ${record.report_id})...`);
  const summary = getReportSummary(record.report_id);
  record.total_hallazgos = summary.totalFindings;
  record.hallazgos = summary.findings;
  console.log(`  -> ${summary.totalFindings} hallazgos reales`);
  return record;
});

fs.writeFileSync(RESULTS_PATH, fixed.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log('OK: experiment_results.jsonl actualizado con hallazgos reales');
