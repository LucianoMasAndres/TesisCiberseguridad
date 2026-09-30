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
  const findings = parseReportResults(xml);
  return { totalFindings: findings.length, findings };
}

// Extrae de la respuesta de get_reports los resultados con severidad > 0
// (misma logica que parseReportResults de docs/run_experiment.js; este script
// se copia solo al contenedor, por eso no la importa).
function parseReportResults(xml) {
  // Cada NVT que depende de una deteccion de producto trae un bloque
  // <detection><result id=...>...</result></detection> ANTES de <host> y
  // <severity>. Sin quitarlo, la regex no codiciosa cortaba el resultado en
  // ese </result> interno, la severidad se leia como 0 y el filtro lo
  // descartaba: asi quedaron fuera del dataset de la campana los 30
  // resultados de "Weak MAC Algorithm(s) Supported (SSH)" y "SSL/TLS:
  // Deprecated TLSv1.0 and TLSv1.1 Protocol Detection" (ver
  // docs/evidencia_campana_gvm/ y docs/test_gmp_results_parsing.js).
  const sinDeteccion = xml.replace(/<detection>[\s\S]*?<\/detection>/g, '');
  const results = sinDeteccion.match(/<result id="[^"]*">[\s\S]*?<\/result>/g) || [];
  return results.map(r => {
    const host = (r.match(/<host>([^<]*)/) || [])[1] || 'desconocido';
    const name = (r.match(/<name>([^<]*)<\/name>/) || [])[1] || '';
    const severity = parseFloat((r.match(/<severity>([^<]*)<\/severity>/) || [])[1] || '0');
    // Mismo fix que docs/run_experiment.js (hallazgo M1, ronda 10 de
    // auditoria independiente): el CVE vive en <nvt><refs><ref type="cve"
    // id="CVE-..."/></refs></nvt>, no en un <cve> directo del resultado.
    const cveRefs = [...r.matchAll(/<ref type="cve" id="([^"]*)"/g)].map(m => m[1]);
    const cveLegacy = (r.match(/<cve>([^<]*)<\/cve>/) || [])[1] || '';
    const cve = cveRefs.length > 0 ? cveRefs.join(', ') : cveLegacy;
    const port = (r.match(/<port>([^<]*)<\/port>/) || [])[1] || '';
    return { host, name, severity, cve, port };
  }).filter(f => f.severity > 0);
}

module.exports = { parseReportResults };

if (require.main === module) {
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
}
