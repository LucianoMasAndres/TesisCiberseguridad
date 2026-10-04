// Validacion de entradas y superficie de los webhooks. Sin laboratorio: ejecuta
// el codigo de los nodos tal como esta en workflows/*.json con un child_process
// simulado que registra cada llamada, asi que ningun comando corre de verdad.
//
//  1. ClassifyAssets (V4) rechaza toda direccion que no sea una IPv4 de 172.20.0.0/24.
//  2. CreateTarget y CreateTask vuelven a validar lo que reciben y no llaman a
//     gvm-cli cuando el dato no pasa.
//  3. Ningun nodo arma comandos como cadena para el shell: solo execFileSync /
//     execFile con arreglo de argumentos.
//  4. Los webhooks exigen el encabezado X-Lab-Token (Header Auth) y el puerto
//     5678 se publica en loopback salvo que se pida otra cosa.
//  5. V3 (prototipo de app movil) valida ?subnet= y ?scan_config=.
//  6. Quien dispara los webhooks envia el encabezado.
//
// Uso (desde cualquier directorio): node docs/test_webhook_security.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', f), 'utf8'));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const v4 = load('workflowV4_windows.json');
const v3 = load('workflowV3_linux.json');
const code = (w, name) => w.nodes.find((n) => n.name === name).parameters.jsCode;

let failures = 0;
function check(label, cond, detail) {
  if (!cond) failures++;
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${label}${cond ? '' : ` -> ${detail}`}`);
}

// child_process simulado: registra las llamadas y devuelve una respuesta fija.
function fakeChildProcess(stdout) {
  const calls = [];
  const out = Buffer.from(stdout || '<ok status="200" id="11111111-2222-3333-4444-555555555555"/>');
  return {
    calls,
    execSync: (cmd) => { calls.push({ fn: 'execSync', cmd }); return out; },
    exec: (cmd, a, b) => { calls.push({ fn: 'exec', cmd }); (b || a)(null, out.toString()); },
    execFileSync: (file, args) => { calls.push({ fn: 'execFileSync', file, args }); return out; },
    execFile: (file, args, a, b) => { calls.push({ fn: 'execFile', file, args }); (b || a)(null, out.toString()); },
  };
}

// Ejecuta el codigo de un nodo Code. refs: salida de los nodos que consulta con $('Nombre').
async function runNode(src, { items = [{ json: {} }], refs = {}, cp = fakeChildProcess() } = {}) {
  const $ = (name) => {
    if (!(name in refs)) throw new Error(`nodo sin ejecutar: ${name}`);
    return { first: () => ({ json: refs[name] }), item: { json: refs[name] } };
  };
  const req = (m) => {
    if (m !== 'child_process') throw new Error(`modulo no permitido: ${m}`);
    return cp;
  };
  const fn = new Function('items', '$', 'require', `return (async () => {${src}\n})()`);
  try {
    return { result: await fn(items, $, req), calls: cp.calls };
  } catch (error) {
    return { error, calls: cp.calls };
  }
}

// Ultimo argumento de una llamada registrada (el XML de gvm-cli o el objetivo de nmap).
const lastArg = (c) => (c && Array.isArray(c.args) ? c.args[c.args.length - 1] : '');

const MALICIOSAS = [
  ['inyeccion con comillas', '172.20.0.13"; id; "'],
  ['sustitucion de comandos', '$(id)'],
  ['acentos graves', '`id`'],
  ['fuera de la subred', '8.8.8.8'],
  ['otra red privada', '192.168.1.10'],
  ['octeto fuera de rango', '172.20.0.256'],
  ['rango', '172.20.0.1-254'],
  ['CIDR', '172.20.0.0/24'],
  ['nombre de host', 'evil.example.com'],
  ['lista en un solo campo', '172.20.0.13, 8.8.8.8'],
  ['XML', "172.20.0.13</hosts><hosts>8.8.8.8"],
  ['direccion de red', '172.20.0.0'],
  ['broadcast', '172.20.0.255'],
  ['cero a la izquierda', '172.20.0.013'],
  ['no es texto', 17220013],
];

(async () => {
  // 1. ClassifyAssets (V4): solo IPv4 de 172.20.0.0/24
  {
    const src = code(v4, 'ClassifyAssets');
    for (const [nombre, ip] of MALICIOSAS) {
      const r = await runNode(src, { items: [{ json: { body: { hosts: [{ ip, ports: [22, 3306, 445] }] } } }] });
      check(`ClassifyAssets rechaza ${nombre} (${JSON.stringify(ip)})`, !!r.error,
        `acepto: ${JSON.stringify(r.result && r.result[0].json.all_ips)}`);
    }
    const r = await runNode(src, { items: [{ json: { body: { hosts: ['172.20.0.13"; id; "'] } } }] });
    check('ClassifyAssets rechaza la inyeccion tambien en el formato de solo IP', !!r.error, 'acepto');

    const mixto = await runNode(src, { items: [{ json: { hosts: [
      { ip: '172.20.0.13', ports: [3306, 22, 445] }, { ip: '8.8.8.8', ports: [22, 3306] }] } }] });
    check('ClassifyAssets rechaza la peticion completa si un solo host esta fuera de alcance', !!mixto.error,
      `acepto: ${JSON.stringify(mixto.result && mixto.result[0].json.all_ips)}`);

    const puertos = await runNode(src, { items: [{ json: { hosts: [{ ip: '172.20.0.13', ports: ['22; id', 70000] }] } }] });
    check('ClassifyAssets rechaza puertos que no son enteros de 1 a 65535', !!puertos.error, 'acepto');

    const ok = await runNode(src, { items: [{ json: { body: { hosts: [
      { ip: '172.20.0.13', ports: [3306, 22, 445] }, { ip: '172.20.0.12', ports: [80, 22] },
      { ip: '172.20.0.11', ports: [80] }, { ip: '172.20.0.3', ports: [22, 3306, 445] }] } } }] });
    const j = ok.result && ok.result[0].json;
    check('ClassifyAssets acepta hosts validos y conserva la clasificacion', !!j && j.all_ips === '172.20.0.13, 172.20.0.12'
      && j.cantidad_hosts === 2 && j.encontrados === true && j.normales.length === 1,
      ok.error ? ok.error.message : JSON.stringify(j));
    for (const [nombre, hosts] of [['un texto', '172.20.0.13'], ['un objeto', { ip: '172.20.0.13' }], ['null', null]]) {
      const r = await runNode(src, { items: [{ json: { body: { hosts } } }] });
      check(`ClassifyAssets rechaza hosts mal formado (${nombre}) en vez de informar red limpia`, !!r.error, 'acepto');
    }
    const muchos = await runNode(src, { items: [{ json: { hosts: Array.from({ length: 255 }, () => ({ ip: '172.20.0.13', ports: [22] })) } }] });
    check('ClassifyAssets rechaza una lista de mas de 254 hosts', !!muchos.error, 'acepto');
    const rep = await runNode(src, { items: [{ json: { hosts: [
      { ip: '172.20.0.13', ports: [3306, 22, 445] }, { ip: '172.20.0.13', ports: [3306, 22, 445] }, { ip: '172.20.0.12', ports: [80, 22] }] } }] });
    check('ClassifyAssets no repite una direccion en el objetivo', !!rep.result && rep.result[0].json.all_ips === '172.20.0.13, 172.20.0.12'
      && rep.result[0].json.cantidad_hosts === 2, rep.error ? rep.error.message : JSON.stringify(rep.result[0].json.all_ips));
    const vacio = await runNode(src, { items: [{ json: { body: { hosts: [] } } }] });
    check('ClassifyAssets acepta la lista vacia (red limpia)', !!vacio.result && vacio.result[0].json.encontrados === false,
      vacio.error && vacio.error.message);
  }

  // 2a. CreateTarget: defensa en profundidad, sin shell
  {
    const src = code(v4, 'CreateTarget');
    for (const all_ips of ['172.20.0.13"; id; "', '172.20.0.13, 8.8.8.8', '$(id)', '', '172.20.0.13</hosts><hosts>8.8.8.8']) {
      const r = await runNode(src, { items: [{ json: { all_ips, cantidad_hosts: 1 } }] });
      check(`CreateTarget rechaza all_ips=${JSON.stringify(all_ips)} sin ejecutar nada`, !!r.error && r.calls.length === 0,
        `error=${!!r.error} llamadas=${JSON.stringify(r.calls)}`);
    }
    const mal = await runNode(src, { items: [{ json: { all_ips: '172.20.0.13', cantidad_hosts: '1</name>' } }] });
    check('CreateTarget rechaza una cantidad de hosts que no es un entero', !!mal.error && mal.calls.length === 0,
      JSON.stringify(mal.calls));
    const ok = await runNode(src, { items: [{ json: { all_ips: '172.20.0.13, 172.20.0.12', cantidad_hosts: 2 } }] });
    const c = ok.calls[0] || {};
    check('CreateTarget llama a gvm-cli con execFileSync y arreglo de argumentos',
      ok.calls.length === 1 && c.fn === 'execFileSync' && c.file === '/home/node/gvm-env/bin/gvm-cli' && Array.isArray(c.args)
      && c.args[c.args.length - 2] === '--xml' && lastArg(c).includes('<hosts>172.20.0.13, 172.20.0.12</hosts>'),
      ok.error ? ok.error.message : JSON.stringify(ok.calls));
  }

  // 2a'. CreateTarget comprueba scan_config antes de crear nada en Greenbone:
  //      si no, un perfil invalido dejaria un objetivo huerfano (CreateTask
  //      falla despues de que el objetivo ya existe).
  {
    const src = code(v4, 'CreateTarget');
    const items = [{ json: { all_ips: '172.20.0.13', cantidad_hosts: 1 } }];
    for (const hook of ['Webhook Nmap', 'Webhook Escaneo Interno']) {
      const bad = await runNode(src, { items, refs: { [hook]: { query: { scan_config: '$(id)' } } } });
      check(`CreateTarget rechaza un scan_config fuera de la lista por ${hook} sin crear el objetivo`,
        !!bad.error && bad.calls.length === 0, `error=${!!bad.error} llamadas=${JSON.stringify(bad.calls)}`);
    }
    const ok = await runNode(src, { items, refs: { 'Webhook Nmap': { query: { scan_config: 'daba56c8-73ec-11df-a475-002264764cea' } } } });
    check('CreateTarget crea el objetivo con un perfil de la lista', ok.calls.length === 1, ok.error ? ok.error.message : JSON.stringify(ok.calls));
    const none = await runNode(src, { items });
    check('CreateTarget crea el objetivo si nadie paso scan_config', none.calls.length === 1, none.error ? none.error.message : JSON.stringify(none.calls));
  }

  // 2b. CreateTask: lista blanca de scan_config
  {
    const src = code(v4, 'CreateTask');
    const TARGET = { stdout: '<create_target_response status="201" id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"/>' };
    const base = { ClassifyAssets: { ip_objetivo: '172.20.0.13' } };
    const run = (refs, items = [{ json: TARGET }]) => runNode(src, { items, refs: { ...base, ...refs } });

    for (const [nombre, cfg] of [
      ['inyeccion', "x'/></create_task>\"; id; \""],
      ['sustitucion de comandos', '$(id)'],
      ['UUID valido fuera de la lista', '708f25c4-7489-11df-8094-002264764cea'],
      ['arreglo', ['daba56c8-73ec-11df-a475-002264764cea', 'x']],
    ]) {
      for (const hook of ['Webhook Nmap', 'Webhook Escaneo Interno']) {
        const r = await run({ [hook]: { query: { scan_config: cfg } } });
        check(`CreateTask rechaza scan_config (${nombre}) por ${hook} sin ejecutar nada`, !!r.error && r.calls.length === 0,
          `error=${!!r.error} llamadas=${JSON.stringify(r.calls)}`);
      }
    }
    for (const cfg of ['daba56c8-73ec-11df-a475-002264764cea', '8715c877-47a0-438d-98a3-27c7a6ab2196']) {
      const r = await run({ 'Webhook Nmap': { query: { scan_config: cfg } } });
      const c = r.calls[0] || {};
      check(`CreateTask acepta el perfil ${cfg.slice(0, 8)} con execFileSync`,
        r.calls.length === 1 && c.fn === 'execFileSync' && lastArg(c).includes(`<config id='${cfg}'/>`),
        r.error ? r.error.message : JSON.stringify(r.calls));
    }
    const def = await run({});
    check('CreateTask usa el perfil de descubrimiento si nadie paso scan_config',
      def.calls.length === 1 && lastArg(def.calls[0]).includes("<config id='8715c877-47a0-438d-98a3-27c7a6ab2196'/>"),
      def.error ? def.error.message : JSON.stringify(def.calls));
    const badTarget = await run({}, [{ json: { stdout: '<create_target_response id="x\'/><evil a=\'"/>' } }]);
    check('CreateTask rechaza un id de target que no es un UUID', !!badTarget.error && badTarget.calls.length === 0,
      JSON.stringify(badTarget.calls));
    const badIps = await runNode(src, { items: [{ json: TARGET }], refs: { ClassifyAssets: { ip_objetivo: '172.20.0.13</name><x>' } } });
    check('CreateTask rechaza una lista de IP que no paso la validacion', !!badIps.error && badIps.calls.length === 0,
      JSON.stringify(badIps.calls));
  }

  // 2c. BuildReport: el texto que viene del reporte de Greenbone (nombre, descripcion,
  //     solucion de cada hallazgo) se escapa antes de insertarlo en el HTML del correo.
  {
    const src = code(v4, 'BuildReport');
    const r = await runNode(src, { items: [{ json: { host: '172.20.0.13', port: '80/tcp', severity: 9.8, cve: 'CVE-1 <b>',
      name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(2)>', solution: 'a & b <i>' } }] });
    const html = (r.result && r.result[0].json.email_body) || '';
    check('BuildReport escapa el HTML de los campos del reporte', !!html && !/<script>|<img src=x|<i>|<b>/.test(html)
      && html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('a &amp; b'),
      r.error ? r.error.message : html.slice(html.indexOf('alert') - 40, html.indexOf('alert') + 60));
  }

  // 3. Ningun nodo pasa cadenas al shell
  for (const [f, w] of [['workflowV4_windows.json', v4], ['workflowV3_linux.json', v3]]) {
    const malos = w.nodes.filter((n) => /\bexecSync\b|\bexec\s*\(|[^a-zA-Z]exec\s*[,}]|shell\s*:\s*true|\bspawn/.test((n.parameters || {}).jsCode || ''))
      .map((n) => n.name);
    check(`${f}: ningun nodo usa execSync/exec (solo execFileSync/execFile)`, malos.length === 0, malos.join(', '));
  }

  // 4. Autenticacion de los webhooks y puerto en loopback
  for (const [f, w] of [['workflowV4_windows.json', v4], ['workflowV3_linux.json', v3]]) {
    for (const hook of w.nodes.filter((n) => n.type === 'n8n-nodes-base.webhook')) {
      const cred = (hook.credentials || {}).httpHeaderAuth;
      check(`${f}: el webhook /${hook.parameters.path} exige Header Auth`,
        hook.parameters.authentication === 'headerAuth' && !!cred && cred.id === 'labWebhookAuth01',
        `authentication=${hook.parameters.authentication} credentials=${JSON.stringify(hook.credentials)}`);
    }
  }
  {
    const compose = read('docker-compose.yml');
    check('docker-compose.yml: n8n publica 5678 en 127.0.0.1 por defecto',
      /-\s*"\$\{N8N_BIND_ADDRESS:-127\.0\.0\.1\}:5678:5678"/.test(compose) && !/-\s*"5678:5678"/.test(compose),
      (compose.match(/.*5678:5678.*/) || ['sin linea de puerto'])[0].trim());
    const entry = fs.existsSync(path.join(ROOT, 'n8n_custom', 'lab-entrypoint.sh')) ? read('n8n_custom', 'lab-entrypoint.sh') : '';
    check('n8n_custom/lab-entrypoint.sh registra la credencial labWebhookAuth01 con el encabezado X-Lab-Token',
      /labWebhookAuth01/.test(entry) && /X-Lab-Token/.test(entry) && /import:credentials/.test(entry) && /urandom/.test(entry),
      entry ? 'falta alguna pieza' : 'no existe');
    check('n8n_custom/Dockerfile usa ese punto de entrada', /lab-entrypoint\.sh/.test(read('n8n_custom', 'Dockerfile')), 'no lo referencia');
  }

  // 5. V3: subred y perfil validados
  {
    const src = code(v3, 'Nmap');
    for (const subnet of ['172.20.0.0/24; id', '$(id)', '8.8.8.0/24', '0.0.0.0/0', '10.0.0.0/8', '192.168.1.0/16',
      '172.20.0.0/24 8.8.8.8', '-iL /etc/passwd', '192.168.1.300/24', ['172.20.0.0/24', 'x']]) {
      const r = await runNode(src, { refs: { Webhook: { query: { subnet } } } });
      check(`V3 Nmap rechaza subnet=${JSON.stringify(subnet)} sin ejecutar nada`, !!r.error && r.calls.length === 0,
        `error=${!!r.error} llamadas=${JSON.stringify(r.calls)}`);
    }
    for (const subnet of ['172.20.0.0/24', '192.168.100.0/24', '10.1.2.0/24', '192.168.1.37', '172.16.5.0/28']) {
      const r = await runNode(src, { refs: { Webhook: { query: { subnet } } } });
      const c = r.calls[0] || {};
      check(`V3 Nmap acepta la red privada ${subnet} con execFileSync`,
        r.calls.length === 1 && c.fn === 'execFileSync' && c.file === 'nmap' && lastArg(c) === subnet,
        r.error ? r.error.message : JSON.stringify(r.calls));
    }
    const def = await runNode(src, {});
    check('V3 Nmap usa la subred del laboratorio sin webhook',
      def.calls.length === 1 && lastArg(def.calls[0]) === '172.20.0.0/24',
      def.error ? def.error.message : JSON.stringify(def.calls));

    const task = code(v3, 'CreateTask');
    const TARGET = { stdout: '<create_target_response status="201" id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"/>' };
    const bad = await runNode(task, { items: [{ json: TARGET }],
      refs: { Code: { ip_objetivo: '192.168.100.5' }, Webhook: { query: { scan_config: '$(id)' } } } });
    check('V3 CreateTask rechaza un scan_config fuera de la lista', !!bad.error && bad.calls.length === 0, JSON.stringify(bad.calls));
    const good = await runNode(task, { items: [{ json: TARGET }],
      refs: { Code: { ip_objetivo: '192.168.100.5' }, Webhook: { query: { scan_config: '8715c877-47a0-438d-98a3-27c7a6ab2196' } } } });
    check('V3 CreateTask acepta un perfil de la lista con execFileSync',
      good.calls.length === 1 && good.calls[0].fn === 'execFileSync', good.error ? good.error.message : JSON.stringify(good.calls));
    const target = await runNode(code(v3, 'CreateTarget'), { items: [{ json: { all_ips: '192.168.100.5"; id; "', cantidad_hosts: 1 } }] });
    check('V3 CreateTarget rechaza una lista de IP con inyeccion', !!target.error && target.calls.length === 0, JSON.stringify(target.calls));
  }

  // 6. Quien dispara los webhooks envia el encabezado
  for (const f of ['launcher.py', path.join('docs', 'run_experiment.js'), path.join('app_celular', 'lib', 'main.dart')]) {
    check(`${f} envia el encabezado X-Lab-Token`, /X-Lab-Token/.test(read(f)), 'no lo envia');
  }

  console.log(failures === 0 ? '\nTODOS LOS CASOS PASAN' : `\n${failures} FALLOS`);
  process.exit(failures === 0 ? 0 : 1);
})();
