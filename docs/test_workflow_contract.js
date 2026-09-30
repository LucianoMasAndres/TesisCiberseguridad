// Contrato entre docs/run_experiment.js y workflows/workflowV4_windows.json, e
// integridad de los workflows. Sin laboratorio: solo lee los archivos.
//
//  1. El webhook que dispara run_experiment.js existe en V4 y entra por el nodo
//     Code (clasificacion por criticidad): es el camino de la campana del
//     14/08/2026, en la que Greenbone recibio solo los activos Alto/Critico
//     (ver docs/evidencia_campana_gvm/).
//  2. En cada workflow, toda conexion y toda referencia $('Nodo') apunta a un
//     nodo existente, y no quedan nombres con mojibake.
//
// Uso (desde cualquier directorio): node docs/test_workflow_contract.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', f), 'utf8'));

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

// 1. Contrato run_experiment.js -> V4
{
  const src = fs.readFileSync(path.join(__dirname, 'run_experiment.js'), 'utf8');
  const m = src.match(/localhost:5678\/webhook\/([a-z0-9-]+)\?/);
  const hookPath = m && m[1];
  const v4 = load('workflowV4_windows.json');
  const hook = v4.nodes.find((n) => n.type === 'n8n-nodes-base.webhook' && n.parameters.path === hookPath);
  check(`run_experiment.js dispara un webhook de V4 (/webhook/${hookPath})`, !!hook,
    `los webhooks de V4 son: ${v4.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook').map((n) => n.parameters.path).join(', ')}`);
  const next = hook && (v4.connections[hook.name]?.main?.[0] || []).map((c) => c.node);
  check('ese webhook entra por el nodo de clasificacion (Code)', !!next && next.includes('Code'),
    `siguiente nodo: ${JSON.stringify(next)}`);
}

// 2. Integridad de los workflows
for (const f of ['workflowV4_windows.json', 'workflowV3_linux.json']) {
  const w = load(f);
  const names = new Set(w.nodes.map((n) => n.name));
  const bad = [];
  for (const [src, v] of Object.entries(w.connections)) {
    if (!names.has(src)) bad.push(`origen ${src}`);
    for (const out of v.main || []) for (const c of out || []) if (!names.has(c.node)) bad.push(`destino ${c.node}`);
  }
  for (const n of w.nodes) {
    for (const r of ((n.parameters || {}).jsCode || '').matchAll(/\$\('([^']+)'\)/g)) {
      if (!names.has(r[1])) bad.push(`referencia $('${r[1]}') en ${n.name}`);
    }
  }
  check(`${f}: conexiones y referencias resuelven`, bad.length === 0, bad.join('; '));
  check(`${f}: sin mojibake en los nombres de nodo`, ![...names].some((n) => /Â|Ã/.test(n)),
    [...names].filter((n) => /Â|Ã/.test(n)).join(', '));
}

// 3. Mensajes y superficie publicada que la tesis describe
{
  const v4 = load('workflowV4_windows.json');
  const limpia = v4.nodes.find((n) => n.name === 'Telegram Red Limpia');
  const code = (limpia && limpia.parameters.jsCode) || '';
  // "Red limpia" no puede afirmar que no hubo hosts cuando si los hubo y todos
  // eran Normal: el mensaje tiene que leer el resultado del nodo Code.
  check('Telegram Red Limpia distingue "sin hosts" de "hosts, ninguno Alto/Critico"',
    /\$\('Code'\)/.test(code) && /Normal/.test(code), 'el mensaje no consulta la clasificacion del nodo Code');

  // Perfiles de Greenbone: solo configuraciones del feed Community.
  // "Full and very deep" (708f25c4-...-8094) y "Full and very deep ultimate"
  // (74db13d6-...) son del Enterprise Feed; el UUID 708f25c4-...-8a11 no existe.
  const ENTERPRISE = ['708f25c4-7489-11df-8a11-002264764cea', '708f25c4-7489-11df-8094-002264764cea',
    '74db13d6-7489-11df-91b9-002264764cea'];
  for (const f of ['launcher.py', path.join('app_celular', 'lib', 'main.dart')]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const found = ENTERPRISE.filter((u) => src.includes(u));
    check(`${f}: sin perfiles de escaneo del Enterprise Feed`, found.length === 0, found.join(', '));
  }

  // Mailpit solo en loopback: n8n le habla por la red interna (mailpit:1025).
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  for (const p of ['8025', '1025']) {
    check(`docker-compose.yml: Mailpit publica ${p} solo en 127.0.0.1`,
      new RegExp(`127\\.0\\.0\\.1:${p}:${p}`).test(compose), `el puerto ${p} se publica en todas las interfaces`);
  }
}

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
