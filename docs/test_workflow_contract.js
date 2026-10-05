// Contrato entre docs/run_experiment.js y workflows/workflowV4_windows.json, e
// integridad de los workflows. Sin laboratorio: solo lee los archivos.
//
//  1. El webhook que dispara run_experiment.js existe en V4 y entra por el nodo
//     ClassifyAssets (clasificacion por criticidad): es el camino de la campana del
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
  check('ese webhook entra por el nodo de clasificacion (ClassifyAssets)', !!next && next.includes('ClassifyAssets'),
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
  // eran Normal: el mensaje tiene que leer el resultado del nodo ClassifyAssets.
  check('Telegram Red Limpia distingue "sin hosts" de "hosts, ninguno Alto/Critico"',
    /\$\('ClassifyAssets'\)/.test(code) && /Normal/.test(code), 'el mensaje no consulta la clasificacion del nodo ClassifyAssets');

  // El nodo de correo (emailSend 2.x) lee el cuerpo del parametro "html" cuando
  // emailFormat es html. Con otro nombre de parametro el correo sale vacio.
  for (const f of ['workflowV4_windows.json', 'workflowV3_linux.json']) {
    const mail = load(f).nodes.find((n) => n.type === 'n8n-nodes-base.emailSend');
    check(`${f}: Send Email envia el cuerpo del reporte (parametro html)`,
      mail.parameters.emailFormat === 'html' && /email_body/.test(mail.parameters.html || '') && mail.parameters.message === undefined,
      `parametros: ${Object.keys(mail.parameters).join(', ')}`);
  }

  // El aviso de escaneo no completado pide revisar la tarea en Greenbone: esa
  // rama no puede terminar en Cleanup, que la envia a la papelera.
  const trasAviso = ((v4.connections['Telegram Scan Timeout'] || {}).main || []).flat().map((c) => c.node);
  check('V4: la rama de escaneo no completado no borra la tarea que pide revisar', !trasAviso.includes('Cleanup'),
    `despues del aviso corre: ${trasAviso.join(', ')}`);

  // curl se invoca de forma sincronica: sin --max-time, un canal que no responde
  // bloquea el Task Runner mas alla de su intervalo de latido y n8n aborta la tarea.
  for (const f of ['workflowV4_windows.json', 'workflowV3_linux.json']) {
    const sinLimite = load(f).nodes.filter((n) => /'curl'/.test((n.parameters || {}).jsCode || '')
      && !/'--max-time', '\d+'/.test(n.parameters.jsCode)).map((n) => n.name);
    check(`${f}: toda llamada a curl tiene tiempo maximo (--max-time)`, sinLimite.length === 0, sinLimite.join(', '));
  }

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

// 4. Programacion diaria de V3 (disparador de las 5 a. m. del Launcher): sin
//    webhook, el nodo Nmap tiene que escanear la subred del laboratorio, no una
//    subred de otro entorno, y excluir su infraestructura (.1, .2 y .3).
{
  const v3 = load('workflowV3_linux.json');
  const nmap = v3.nodes.find((n) => n.name === 'Nmap').parameters.jsCode;
  const def = (nmap.match(/let subnet = '([^']+)'/) || [])[1];
  check('V3: la subred por defecto del disparador diario es la del laboratorio', def === '172.20.0.0/24',
    `subred por defecto: ${def}`);
  const code = v3.nodes.find((n) => n.name === 'Code').parameters.jsCode;
  const missing = ['172.20.0.1', '172.20.0.2', '172.20.0.3'].filter((ip) => !code.includes(`"${ip}"`));
  check('V3: el nodo Code excluye la infraestructura de lab-net (.1, .2, .3)', missing.length === 0,
    `faltan: ${missing.join(', ')}`);
}

// 5. Remisiones y comentarios que la tesis cita
{
  const v4src = fs.readFileSync(path.join(ROOT, 'workflows', 'workflowV4_windows.json'), 'utf8');
  check('V4: los comentarios no remiten a una etiqueta inexistente de la tesis ("K2")', !/K2 en la tesis/.test(v4src),
    'queda "ver K2 en la tesis"');
  const launcher = fs.readFileSync(path.join(ROOT, 'launcher.py'), 'utf8');
  check('launcher.py no atribuye a la condicion de carrera la omision de .10 en la campana',
    !/detr[aá]s de que 172\.20\.0\.10 nunca fuera detectado/.test(launcher), 'el docstring la atribuye');
  const entry = fs.readFileSync(path.join(ROOT, 'lab-targets', 'legacy', 'entrypoint.sh'), 'utf8');
  const telnet = (entry.match(/\n\s*telnet\)([\s\S]*?);;/) || [])[1] || '';
  check('telnet-17 vuelve a escuchar despues de cada conexion (in.telnetd -debug atiende una sola)',
    /while true/.test(telnet) && !/exec \/usr\/sbin\/in\.telnetd/.test(telnet), telnet.trim().split('\n').pop());
}

console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
process.exit(failures === 0 ? 0 : 1);
