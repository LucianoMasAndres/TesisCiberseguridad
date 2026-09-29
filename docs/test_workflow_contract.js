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

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
