// Test unitario del parseo de reportes GMP, sin laboratorio. Usa un fragmento
// real de get_reports (docs/fixtures/gmp_report_detection.xml, reporte del
// operador 1 sobre 172.20.0.13, 18/09/2026) con cinco resultados:
//   - dos NVT con bloque <detection> anidado y severidad > 0
//     (Weak MAC Algorithm(s) Supported (SSH), SSL/TLS: Deprecated TLSv1.0 and
//     TLSv1.1 Protocol Detection);
//   - dos NVT sin <detection> y severidad > 0 (TCP Timestamps, Renegotiation DoS);
//   - un resultado informativo con <detection> y severidad 0.
//
// El bloque <detection> contiene un <result id=...>...</result> anidado que
// aparece ANTES de <host> y <severity>. La expresion regular no codiciosa
// original cortaba el resultado en ese </result> interno: el fragmento quedaba
// sin <severity>, se leia como 0 y el filtro severity > 0 lo descartaba. Ese
// error dejo fuera del dataset de la campana 30 resultados con QoD >= 70
// (docs/evidencia_campana_gvm/hallazgos_omitidos_por_parser_2026-08-14.txt).
//
// Uso (desde cualquier directorio): node docs/test_gmp_results_parsing.js

const fs = require('fs');
const path = require('path');

const XML = fs.readFileSync(path.join(__dirname, 'fixtures', 'gmp_report_detection.xml'), 'utf8');

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

const EXPECTED = [
  { name: 'SSL/TLS: Deprecated TLSv1.0 and TLSv1.1 Protocol Detection', severity: 4.3, port: '3306/tcp' },
  { name: 'SSL/TLS: Renegotiation DoS Vulnerability (CVE-2011-1473, CVE-2011-5094)', severity: 5.0, port: '3306/tcp' },
  { name: 'TCP Timestamps Information Disclosure', severity: 2.6, port: 'general/tcp' },
  { name: 'Weak MAC Algorithm(s) Supported (SSH)', severity: 2.6, port: '22/tcp' },
];

function checkParser(label, parse) {
  const findings = parse(XML);
  const names = findings.map((f) => f.name).sort();
  check(`${label}: extrae los 4 resultados con severidad > 0`, findings.length === 4,
    `obtenidos ${findings.length}: ${JSON.stringify(names)}`);
  for (const e of EXPECTED) {
    const f = findings.find((x) => x.name === e.name);
    check(`${label}: ${e.name}`, !!f && f.severity === e.severity && f.host === '172.20.0.13' && f.port === e.port,
      f ? JSON.stringify(f) : 'no extraido');
  }
  const dep = findings.find((x) => x.name.startsWith('SSL/TLS: Deprecated'));
  check(`${label}: CVE de las referencias del NVT con <detection>`,
    !!dep && dep.cve.split(', ').includes('CVE-2011-3389'), dep ? dep.cve : 'no extraido');
  check(`${label}: descarta el resultado informativo (severidad 0)`,
    !findings.some((x) => x.name === 'SSH Protocol Algorithms Supported'), 'lo incluyo');
}

checkParser('run_experiment.js', require('./run_experiment.js').parseReportResults);
checkParser('reextract_findings.js', require('./reextract_findings.js').parseReportResults);

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
