# Anexo E v2 — Algoritmo de clasificación de criticidad

## Metodología de diseño (por qué esta vez es consistente)

La auditoría de 2026-08-04 (hallazgos C1, C2, A4) detectó que la versión anterior del
algoritmo (`SERVICE_WEIGHTS` + `classifyAsset`) no reproducía la clasificación publicada
en el Anexo F: 7 de 12 activos se clasificaban distinto a lo declarado, y la categoría
"Crítico" era matemáticamente inalcanzable (máximo posible 19 puntos, umbral `> 20`).

La causa raíz: el ground truth (Anexo F) y el algoritmo (Anexo E) se escribieron por
separado y se declaró que se habían "validado manualmente", sin ejecutar realmente el
código sobre los datos.

**Esta versión invierte el orden de trabajo:** primero se fija la tabla de pesos con
una justificación de riesgo explícita, después se diseña el laboratorio de 12 activos,
y la clasificación esperada se obtiene *ejecutando* la función sobre cada activo — no
se declara a mano. Cualquiera puede reproducir la tabla completa corriendo
`classifyAsset()` (ver más abajo) sobre los puertos de cada host.

## Tabla de pesos (`SERVICE_WEIGHTS`)

| Puerto | Servicio | Peso | Justificación |
|---|---|---|---|
| 21 | FTP | 7 | Credenciales y datos en texto plano; anónimo habilitado es hallazgo frecuente |
| 22 | SSH | 9 | Acceso administrativo remoto; compromiso de credenciales = control total del host |
| 23 | Telnet | 12 | Protocolo obsoleto, sin cifrado, credenciales y sesión completa en claro |
| 25 | SMTP | 4 | Superficie de ataque de correo; relay abierto es el riesgo típico |
| 80 | HTTP | 5 | Superficie de aplicación web sin cifrado de transporte |
| 161/udp | SNMP | 6 | *Community string* por defecto (`public`) expone inventario y a veces permite escritura |
| 389 | LDAP | 7 | Servicio de directorio; *bind* anónimo expone estructura organizacional completa |
| 443 | HTTPS | 4 | Igual superficie que HTTP pero con cifrado de transporte (riesgo levemente menor) |
| 445 | SMB | 8 | Historial de RCE críticos (EternalBlue, SambaCry); vector de movimiento lateral |
| 587 | SMTP (submission) | 4 | Igual que 25 |
| 3306 | MySQL | 10 | Exposición directa de motor de base de datos |
| 5432 | PostgreSQL | 10 | Exposición directa de motor de base de datos |
| 6379 | Redis | 10 | Sin autenticación por defecto en versiones antiguas; RCE vía `CONFIG SET` documentado |
| 8080 | HTTP alternativo | 5 | Igual que HTTP |
| (no listado) | — | 1 | Piso mínimo para puertos no catalogados, evita puntaje cero |

`score(activo) = Σ SERVICE_WEIGHTS[puerto]` para cada puerto abierto detectado por Nmap.

## Umbrales de clasificación

Para evitar la ambigüedad del hallazgo A4 (prosa decía "10–20 → Alto", código usaba
`score > 10`), esta vez la definición es única y sin zonas grises:

- `score ≤ 10` → **Normal**
- `10 < score ≤ 20` → **Alto**
- `score > 20` → **Crítico**

Ningún activo del laboratorio tiene un puntaje exactamente igual a 10 o 20 (ver tabla),
así que no hay casos límite que dependan de `>` vs `≥`.

## Código (`classifyAsset`)

```javascript
const SERVICE_WEIGHTS = {
  21: 7,    // FTP
  22: 9,    // SSH
  23: 12,   // Telnet
  25: 4,    // SMTP
  80: 5,    // HTTP
  161: 6,   // SNMP
  389: 7,   // LDAP
  443: 4,   // HTTPS
  445: 8,   // SMB
  587: 4,   // SMTP submission
  3306: 10, // MySQL
  5432: 10, // PostgreSQL
  6379: 10, // Redis
  8080: 5,  // HTTP alt
};

function classifyAsset(openPorts) {
  // openPorts: array de numeros de puerto (ej: [22, 445])
  const score = openPorts.reduce(
    (sum, port) => sum + (SERVICE_WEIGHTS[port] || 1),
    0
  );

  let classification;
  if (score > 20) classification = 'Critico';
  else if (score > 10) classification = 'Alto';
  else classification = 'Normal';

  return { score, classification };
}

module.exports = { SERVICE_WEIGHTS, classifyAsset };
```

## Anexo F v2 — Laboratorio de 12 activos (ground truth derivado)

Cada fila se obtiene **ejecutando** `classifyAsset()` sobre los puertos declarados, no
al revés. La columna "Vulnerabilidad real" describe la condición insegura genuina que
se despliega en el contenedor correspondiente (ver `docker-compose.lab-targets.yml`),
para que Greenbone tenga algo real que detectar.

| IP | Rol | Puertos abiertos | Cálculo | Score | Clase | Vulnerabilidad real desplegada |
|---|---|---|---|---|---|---|
| 172.20.0.10 | Web pública | 80, 443 | 5+4 | 9 | Normal | nginx actualizado, TLS autofirmado — control, sin hallazgo esperado |
| 172.20.0.11 | Landing interna | 80 | 5 | 5 | Normal | httpd actualizado — control, sin hallazgo esperado |
| 172.20.0.12 | Panel admin interno | 80, 22 | 5+9 | 14 | Alto | OpenSSH desactualizado (8.0) con `PasswordAuthentication` habilitado |
| 172.20.0.13 | BD de desarrollo | 3306, 22, 445 | 10+9+8 | 27 | Crítico | MySQL 5.7 (CVE conocidas) + Samba con *guest access* habilitado (sin RCE conocido en la versión instalada — 4.13 sobre `debian:11-slim`, parcheada contra CVE-2017-7494) |
| 172.20.0.14 | Réplica de BD | 5432, 22 | 10+9 | 19 | Alto | PostgreSQL 9.6 desactualizado |
| 172.20.0.15 | Directorio corporativo | 389, 80 | 7+5 | 12 | Alto | OpenLDAP con *bind* anónimo habilitado |
| 172.20.0.16 | Servidor de correo | 25, 587, 22 | 4+4+9 | 17 | Alto | Postfix configurado como *open relay* |
| 172.20.0.17 | Dispositivo de red | 161/udp, 23, 445 | 6+12+8 | 26 | Crítico | SNMP *community string* `public` de lectura/escritura + Telnet con credenciales por defecto |
| 172.20.0.18 | Servicio de reportes | 8080 | 5 | 5 | Normal | App interna actualizada — control, sin hallazgo esperado |
| 172.20.0.19 | Servidor FTP | 21, 22 | 7+9 | 16 | Alto | vsftpd con login anónimo habilitado |
| 172.20.0.20 | File server SMB | 22, 445 | 9+8 | 17 | Alto | Samba con *guest access* habilitado (sin RCE) |
| 172.20.0.21 | Cache expuesto | 6379, 80, 21 | 10+5+7 | 22 | Crítico | Redis sin autenticación (`requirepass` vacío) — RCE vía `CONFIG SET dir` + `MODULE LOAD` documentado |

Distribución resultante: **3 Normal, 6 Alto, 3 Crítico** — las tres clases son alcanzables
(máximo posible en este laboratorio: 27, muy por encima del umbral de 20), a diferencia
de la versión auditada donde "Crítico" era inalcanzable por diseño.

## Verificación del laboratorio (2026-08-14) — hallazgo arquitectónico

Se construyó el laboratorio real (`lab-targets/docker-compose.lab-targets.yml`, 12
hosts en `172.20.0.10-21`, cada uno con contenedor "ancla" + contenedores de servicio
compartiendo su namespace de red) y se escaneó con Nmap real (no simulado):

```
docker run --rm --network lab-targets_lab-net instrumentisto/nmap:latest \
  -sS -sU -sV --open -p T:21,22,23,25,80,389,443,445,587,3306,5432,6379,8080,U:161 \
  172.20.0.10-21
```

**Resultado: los 12 hosts coinciden exactamente con los puertos declarados en la
tabla de ground truth.** Servicios reales detectados por versión (nginx 1.25.5,
Apache httpd 2.4.68, OpenSSH 8.4p1, MySQL 5.7.44, PostgreSQL 9.6.24, OpenLDAP,
Samba 4, vsftpd 3.0.3, Redis 5.0.14, snmpd net-snmp con community `public`, telnetd).

**Hallazgo importante — el flujo V4 (`scan.ps1`, escaneo externo desde el host
Windows) no puede funcionar en Docker Desktop para Windows tal como está diseñado.**
Se verificó con `Test-NetConnection` que el host Windows no puede alcanzar
directamente la subred bridge interna de Docker (`172.20.0.0/24`): los contenedores
en una red bridge definida por el usuario no son enrutables desde el host salvo por
puertos publicados explícitamente. Esto probablemente explica el commit
`1e085cb fix: bugs reales en pipeline V3/V4 nunca probado end-to-end` del historial
del repo — la arquitectura nunca se validó de punta a punta contra un laboratorio real.

**Corrección adoptada:** Nmap debe ejecutarse **dentro de un contenedor conectado a
la misma red que el laboratorio** (esto es, de hecho, lo que el capítulo IV original
de la tesis afirmaba como decisión arquitectónica en §4.1/§4.5, antes de que el
"flujo V4 con escaneo externo" se agregara sin haberlo probado). El pipeline de n8n
debe ejecutar el descubrimiento y el escaneo de puertos desde dentro del contenedor
de n8n (o un contenedor scanner dedicado) unido a `lab-net`, no desde `scan.ps1` en
el host Windows.

## Validación end-to-end dentro de n8n (2026-08-14)

Se conectó `lab-net` a la red del contenedor de n8n (`docker-compose.yml`), se
otorgó a Nmap capacidad de escaneo SYN/UDP mediante bit `setuid` (ver nota más
abajo), y se agregó el nodo `NmapScan` al workflow (`workflows/workflowV4_windows.json`)
que ejecuta descubrimiento + escaneo de puertos **desde dentro del contenedor de
n8n**, reemplazando la dependencia rota de `scan.ps1` en el host Windows.

Se corrió el pipeline completo (`NmapScan` → `Code`) tal como está en el archivo
del workflow, contra el laboratorio real (`docs/test_e2e_pipeline.js`):

```
=== E2E TEST: PASA (pipeline real, nmap real, clasificacion real) ===
```

Los 12 hosts clasificaron exactamente como el ground truth predice.

**Nota sobre `setcap` vs `setuid`.** Se intentó primero `setcap
cap_net_raw,cap_net_admin+eip` sobre el binario de nmap (el método recomendado
para no correr como root). `getcap` confirmaba la capacidad aplicada
correctamente, y el contenedor tenía `CAP_NET_RAW`/`CAP_NET_ADMIN` en su
*bounding set* (`cap_add` en `docker-compose.yml`) — pero Nmap seguía rechazando
`-sS`/`-sU` como usuario no root. Verificado que el mismo comando funciona con
`docker exec -u root`, confirmando que el problema es la propagación de
capabilities de archivo en este entorno de contenedor, no la lógica de Nmap. Se
optó por el método alternativo que la propia documentación de Nmap describe
(`chmod u+s`), que sí funciona (con la advertencia de seguridad esperada, aceptable
en un laboratorio controlado y no expuesto).

**Bug real encontrado y corregido:** el contenedor `telnet-17` (activo `.17`)
salía con código 1 sin loguear nada. Causa: `in.telnetd -debug` requiere un
**puerto** como argumento (`-debug 23`) para correr en modo standalone; sin él,
intenta comportarse como si `inetd` le fuera a pasar un socket por stdin, lo cual
nunca ocurre en este contexto, y falla. Sin este contenedor corriendo, el activo
`.17` perdía el puerto 23 y clasificaba Alto (14) en vez de Crítico (26) — la
primera corrida del test end-to-end lo detectó automáticamente por discrepancia
contra el ground truth, exactamente el tipo de verificación cruzada que la
auditoría original nunca hizo.

## Nota operativa: contenedor `mail-16` requirió reinicio (2026-08-14)

Durante la corrida real del experimento (tarea 5), el host `172.20.0.16` apareció
consistentemente con solo el puerto 22 abierto (faltaban 25/587 de Postfix), pese a
que el contenedor estaba `Up` sin reinicios y la configuración de Postfix
(`postconf`, `master.cf`) era correcta (`postfix check` no reportó errores). Un
`docker restart lab-targets-mail-16-1` resolvió el problema inmediatamente
(25 y 587 quedaron abiertos). Causa probable: condición de arranque relacionada
con el reordenamiento de la red `lab-net` durante la sesión (el contenedor pudo
haber iniciado antes de que la red terminara de adjuntarse correctamente). Si
esto se repite en corridas futuras, reiniciar el contenedor afectado antes de
medir es más simple que depurar más a fondo, y debe registrarse como nota
metodológica si afecta a alguna repetición del experimento (afecta a la
repetición 1: ver `docs/experiment_results.jsonl`).

## Bug crítico encontrado durante la tarea 5: `ospd-openvas` sin ruta a `lab-net`

Al correr la primera repetición real del experimento, Greenbone terminó los
escaneos en 60-150 segundos con **cero hallazgos** en los 8-9 activos Alto/Crítico
— sospechoso para un perfil "Full and fast" contra servicios deliberadamente
vulnerables. Los logs del motor de escaneo (`docker logs
tesisciberseguridad-openvas-1`) revelaron la causa exacta:

```
libgvm boreas: MESSAGE: Alive scan ... finished in 5 seconds: 0 alive hosts of 9.
```

El módulo de detección de host vivo del propio escáner (Boreas) determinaba que
**ningún** activo respondía, así que OpenVAS se saltaba toda la batería de NVTs
por diseño (no tiene sentido testear un host "muerto"). La causa raíz: al conectar
`lab-net` al stack de n8n/Greenbone (tarea 4) solo se agregó la red al servicio
`n8n` — pero el que efectivamente ejecuta el escaneo de vulnerabilidades es el
servicio `ospd-openvas`, que seguía aislado en `greenbone-net` sin ninguna ruta a
`172.20.0.0/24`. Confirmado con una prueba directa de socket TCP desde dentro del
contenedor (`FALLA: [Errno 113] No route to host` antes del fix, `CONECTA OK`
después).

**Corrección:** se agregó `lab-net` a las `networks` del servicio `ospd-openvas`
en `docker-compose.yml`. Tras recrear el contenedor, la conectividad TCP al
laboratorio quedó confirmada.

**Por qué importa:** este es exactamente el tipo de suposición de conectividad
nunca verificada que llevó al hallazgo C3 de la auditoría original (tiempos de
ciclo incompatibles con lo declarado) — sin este chequeo, las 5 repeticiones del
experimento habrían corrido "exitosamente" en segundos y producido una tabla de
resultados con cero hallazgos, reproduciendo exactamente el mismo patrón de
"el sistema completa pero no mide lo que dice medir" que hundió el capítulo V
original.

## Inestabilidad de contenedores del laboratorio durante el experimento real (2026-08-14)

Al correr las 5 repeticiones reales, el número de activos Alto/Crítico detectados
varió entre repeticiones (9, 8, 7, 7...) en lugar de mantenerse constante en 9.
Causa raíz identificada: **ninguno de los servicios de `lab-targets` tenía
política de reinicio** (`restart:` ausente en `docker-compose.lab-targets.yml`),
y dos de ellos se cayeron sin dejar logs durante la ejecución:

- `telnet-17`: `in.telnetd -debug 23` en este modo standalone parece atender
  una única conexión y terminar, en vez de aceptar conexiones repetidas
  indefinidamente. Esto le resta el puerto 23 (12 puntos) al host `.17`,
  bajándolo de 26 puntos (Crítico) a 14 (Alto) en las repeticiones donde ya
  se había usado una vez.
- `ftp-19`: salió sin log tras la repetición 1, causa exacta no determinada.

**Corrección:** se agregó `restart: unless-stopped` a los 37 servicios de
`docker-compose.lab-targets.yml` (vía script, verificado que el YAML resultante
sigue siendo válido con `docker compose config --quiet`), y se reaplicó el
stack con `docker compose up -d`, lo que recreó todos los contenedores con la
nueva política. Esto ocurrió **a mitad de la repetición 4**, que ya había
capturado su lista de hosts objetivo (7, sin `.16` ni con `.17` en Crítico)
antes del fix, y cuya conectividad a los targets ya en análisis por Greenbone
pudo verse momentáneamente interrumpida por la recreación de los contenedores
ancla. **La repetición 4 debe tratarse como potencialmente comprometida** y
excluirse o marcarse como anómala en el análisis del capítulo V; la repetición
5 (posterior al fix, con todos los contenedores ya estables) es la primera
que debería reproducir de forma confiable el conteo completo de 9 activos
Alto/Crítico.

**Lección metodológica:** esta variabilidad NO se hubiera detectado sin comparar
la clasificación de cada repetición contra el ground truth conocido — es
exactamente el tipo de control cruzado que la auditoría 2026-08-04 echó en
falta en el trabajo original (§3.8, validez interna).

## Verificación de reproducibilidad

Test unitario mínimo que cualquier tribunal puede correr (`node docs/test_classify.js`
o equivalente en el runner de CI):

```javascript
const { classifyAsset } = require('./anexo_e_f_v2_code'); // extraer el bloque de arriba

const casos = [
  { ip: '172.20.0.10', puertos: [80, 443], esperado: 'Normal' },
  { ip: '172.20.0.11', puertos: [80], esperado: 'Normal' },
  { ip: '172.20.0.12', puertos: [80, 22], esperado: 'Alto' },
  { ip: '172.20.0.13', puertos: [3306, 22, 445], esperado: 'Critico' },
  { ip: '172.20.0.14', puertos: [5432, 22], esperado: 'Alto' },
  { ip: '172.20.0.15', puertos: [389, 80], esperado: 'Alto' },
  { ip: '172.20.0.16', puertos: [25, 587, 22], esperado: 'Alto' },
  { ip: '172.20.0.17', puertos: [161, 23, 445], esperado: 'Critico' },
  { ip: '172.20.0.18', puertos: [8080], esperado: 'Normal' },
  { ip: '172.20.0.19', puertos: [21, 22], esperado: 'Alto' },
  { ip: '172.20.0.20', puertos: [22, 445], esperado: 'Alto' },
  { ip: '172.20.0.21', puertos: [6379, 80, 21], esperado: 'Critico' },
];

let fallos = 0;
for (const caso of casos) {
  const { classification, score } = classifyAsset(caso.puertos);
  const ok = classification === caso.esperado;
  if (!ok) fallos++;
  console.log(`${caso.ip}: score=${score} clase=${classification} esperado=${caso.esperado} ${ok ? 'OK' : 'FALLO'}`);
}
console.log(fallos === 0 ? 'TODOS LOS CASOS PASAN' : `${fallos} CASOS FALLARON`);
```
