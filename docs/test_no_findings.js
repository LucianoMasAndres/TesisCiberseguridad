// Analisis sin hallazgos. Sin laboratorio: ejecuta el codigo de los nodos tal
// como esta en workflows/*.json.
//
// En n8n, un nodo Code que no devuelve items corta el flujo: los nodos
// siguientes no se ejecutan. Si Greenbone no informa ningun resultado de
// severidad mayor que 0, el nodo de parseo no puede devolver una lista vacia,
// porque entonces no habria reporte final, correo ni limpieza de la tarea y del
// objetivo en Greenbone.
//
//  1. El nodo de parseo devuelve siempre al menos un item.
//  2. El nodo que arma el reporte produce, sin hallazgos, un reporte completo:
//     todos los campos que leen Telegram y el correo, con los activos analizados.
//  3. Con hallazgos, el reporte no cambia.
//
// Uso (desde cualquier directorio): node docs/test_no_findings.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', f), 'utf8'));

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

// Ejecuta el codigo de un nodo Code. refs: salida de los nodos que consulta con $('Nombre').
async function runNode(src, { items = [{ json: {} }], refs = {} } = {}) {
  const $ = (name) => {
    if (!(name in refs)) throw new Error(`nodo sin ejecutar: ${name}`);
    return { first: () => ({ json: refs[name] }), item: { json: refs[name] } };
  };
  const fn = new Function('items', '$', `return (async () => {${src}\n})()`);
  try {
    return { result: await fn(items, $) };
  } catch (error) {
    return { error };
  }
}

// Reporte de get_reports tal como lo entrega el nodo XML de n8n.
const reporte = (results) => ({ get_reports_response: { report: {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', creation_time: '2026-10-04T10:05:01Z', report: { results } } } });
const resultado = (severity) => ({ host: { _: '172.20.0.13' }, port: '22/tcp', severity: String(severity),
  name: 'Weak MAC Algorithm(s) Supported (SSH)', description: 'd', nvt: { solution: 's' } });

const SIN_HALLAZGOS = [
  ['el reporte no trae resultados', reporte({})],
  ['todos los resultados son informativos (severidad 0)', reporte({ result: [resultado(0), resultado('0.0')] })],
  ['un unico resultado informativo', reporte({ result: resultado(0) })],
  ['el reporte no tiene la estructura esperada', { get_reports_response: {} }],
];
const CAMPOS = ['email_body', 'subject', 'hosts_string', 'scan_date', 'total_hallazgos',
  'critical_count', 'high_count', 'medium_count', 'low_count'];

const FLUJOS = [
  { f: 'workflowV4_windows.json', parseo: 'ParseFindings', armado: 'BuildReport', clasif: 'ClassifyAssets', extra: [] },
  { f: 'workflowV3_linux.json', parseo: 'parseo', armado: 'Code in JavaScript2', clasif: 'Code', extra: ['top3_text'] },
];

(async () => {
  for (const { f, parseo, armado, clasif, extra } of FLUJOS) {
    const w = load(f);
    const code = (name) => w.nodes.find((n) => n.name === name).parameters.jsCode;
    const refs = { [clasif]: { all_ips: '172.20.0.13, 172.20.0.12', ip_objetivo: '172.20.0.13, 172.20.0.12', cantidad_hosts: 2 } };

    for (const [nombre, json] of SIN_HALLAZGOS) {
      const p = await runNode(code(parseo), { items: [{ json }] });
      const n = Array.isArray(p.result) ? p.result.length : 0;
      check(`${f}: ${parseo} devuelve un item cuando ${nombre}`, n === 1,
        p.error ? p.error.message : `devolvio ${n} items: el flujo terminaria sin reporte ni limpieza`);
      if (n !== 1) continue;

      const r = await runNode(code(armado), { items: p.result, refs });
      const j = (r.result && r.result[0] && r.result[0].json) || {};
      const faltan = [...CAMPOS, ...extra].filter((k) => j[k] === undefined || j[k] === null || /undefined|NaN/.test(String(j[k])));
      check(`${f}: ${armado} arma un reporte completo cuando ${nombre}`, !r.error && faltan.length === 0,
        r.error ? r.error.message : `campos sin valor: ${faltan.join(', ')}`);
      check(`${f}: ese reporte informa 0 hallazgos sobre los activos analizados`,
        j.total_hallazgos === 0 && j.critical_count === 0 && j.high_count === 0 && j.medium_count === 0 && j.low_count === 0
        && j.hosts_string === '172.20.0.13, 172.20.0.12' && /sin hallazgos/i.test(String(j.subject))
        && /no inform[oó] hallazgos/i.test(String(j.email_body)),
        JSON.stringify({ total: j.total_hallazgos, hosts: j.hosts_string, subject: j.subject }));
    }

    // Con hallazgos, el reporte no cambia: el centinela no se cuenta.
    const p = await runNode(code(parseo), { items: [{ json: reporte({ result: [resultado(2.6), resultado(0), resultado(9.8)] }) }] });
    check(`${f}: ${parseo} conserva solo los resultados de severidad mayor que 0`,
      Array.isArray(p.result) && p.result.length === 2 && p.result.every((i) => i.json.severity > 0 && !i.json.sin_hallazgos),
      p.error ? p.error.message : JSON.stringify(p.result));
    const r = await runNode(code(armado), { items: p.result || [], refs });
    const j = (r.result && r.result[0] && r.result[0].json) || {};
    check(`${f}: ${armado} cuenta los hallazgos reales`,
      j.total_hallazgos === 2 && j.critical_count === 1 && j.low_count === 1 && j.hosts_string === '172.20.0.13'
      && /CRITICO/.test(String(j.subject)), r.error ? r.error.message : JSON.stringify({ total: j.total_hallazgos, subject: j.subject }));
  }

  // V3 adjunta el reporte crudo al correo (fileAttachments: data): sin el
  // binario, el nodo de correo falla y Cleanup no corre por esa rama.
  {
    const w = load('workflowV3_linux.json');
    const code = (name) => w.nodes.find((n) => n.name === name).parameters.jsCode;
    const p = await runNode(code('parseo'), { items: [{ json: reporte({}) }] });
    const r = await runNode(code('Code in JavaScript2'), { items: p.result || [], refs: { Code: { all_ips: '172.20.0.13' } } });
    const bin = r.result && r.result[0] && r.result[0].binary && r.result[0].binary.data;
    check('workflowV3_linux.json: el reporte sin hallazgos conserva el adjunto que espera el correo',
      !!bin && !!bin.data && bin.fileName === 'reporte_raw.json', r.error ? r.error.message : 'sin binary.data');
  }

  console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
  process.exit(failures === 0 ? 0 : 1);
})();
