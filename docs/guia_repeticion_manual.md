# Guía rápida — repetición manual (brazo comparativo)

Chuleta operativa para correr las repeticiones del brazo manual con
`docs/cronometro_manual.py`. Replica lo que hace el brazo automatizado
(`docs/run_experiment.js`) pero a mano: mismo subred, mismos puertos, misma
tabla de clasificación (Anexo E) — la única diferencia es que vos hacés cada
paso en vez del workflow de n8n.

**Necesitás 2 ventanas de terminal + 1 navegador:**
- Terminal A: el cronómetro (`python docs/cronometro_manual.py --rep N`)
- Terminal B: donde escribís los comandos reales (nmap, `marcar.py`)
- Navegador: Greenbone GUI (http://localhost:9392, `admin` / `admin123`)

Docker ya tiene que estar arriba (`docker ps` te tiene que mostrar
`n8n-security-lab`, `greenbone-community-edition-gvmd-1` como `healthy`, y los
`lab-targets-*`).

**Nota Windows:** todos los comandos de esta guía (incluido el `nmap`) están
listos para copiar y pegar tal cual en PowerShell — no hace falta traducir
nada. El truco es que `nmap` corre *adentro* del contenedor Linux
(`docker exec -u node n8n-security-lab ...`), nunca directo en el host
Windows, porque el host no puede alcanzar la red Docker `172.20.0.0/24`
directamente. Si en algún momento te pasan un comando de `nmap` para correr
"directo" (sin el `docker exec` adelante) — típicamente porque alguien lo
probó en Linux, donde el host sí llega a esa red — ese comando no te va a
andar en Windows: envolvelo con `docker exec -u node n8n-security-lab` antes
de tipearlo.

---

## 0. Arrancar el cronómetro (Terminal A)

```
python docs/cronometro_manual.py --rep 1
```

Se queda esperando el hito T0. En Terminal B vas a marcar cada hito con:

```
python docs/marcar.py
```

(no importa desde qué terminal lo corras — el cronómetro lo detecta solo,
no hace falta volver a la ventana A).

---

## 1. T0 — antes de arrancar Nmap

Justo antes de tipear el comando de descubrimiento, corré `python docs/marcar.py`
en Terminal B (o ENTER en Terminal A). Esto es manual por definición: todavía
no arrancó nada que se pueda auto-detectar.

## 2. T1 — fin de Nmap + análisis visual del output

Nmap corre **dentro del contenedor `n8n-security-lab`** (el host Windows no
puede alcanzar la red `172.20.0.0/24` de Docker directamente — ver
`docs/anexo_e_f_v2.md`, sección "Verificación del laboratorio").

**Descubrimiento** (quién está vivo):
```
docker exec -u node n8n-security-lab nmap -sn -n 172.20.0.0/24
```
Ignorá `.1`, `.2` y `.3` de los resultados (infraestructura de red / ospd-openvas,
no son activos del laboratorio — ver Anexo F).

**Escaneo de puertos/servicios** sobre los hosts vivos (ajustá la lista de IPs
al resultado del paso anterior; el laboratorio completo son `.10` a `.21`):
```
docker exec -u node n8n-security-lab nmap -Pn --open -p T:21,22,23,25,80,389,443,445,587,3306,5432,6379,8080,U:161 -sS -sU -sV 172.20.0.10-21
```

Cuando termines de correr el comando **y** de revisar el output a ojo, marcá:
```
python docs/marcar.py
```
(no lo encadenes al comando de nmap con `;` salvo que no necesites tiempo de
revisión aparte — el hito T1 incluye el análisis visual, no solo la ejecución).

## 3. T2 — fin de la clasificación manual

Para cada host, sumá los pesos de sus puertos abiertos (tabla abajo) y aplicá
el umbral. Anotá host → puertos → score → clase en algún lado (papel o un
`.txt` fuera del repo) para poder redactar el informe después.

| Puerto | Peso | | Puerto | Peso |
|---|---|---|---|---|
| 21 (FTP) | 7 | | 445 (SMB) | 8 |
| 22 (SSH) | 9 | | 587 (SMTP submission) | 4 |
| 23 (Telnet) | 12 | | 3306 (MySQL) | 11 |
| 25 (SMTP) | 4 | | 5432 (PostgreSQL) | 11 |
| 80 (HTTP) | 5 | | 6379 (Redis) | 11 |
| 161/udp (SNMP) | 6 | | 8080 (HTTP alt) | 5 |
| 389 (LDAP) | 7 | | 443 (HTTPS) | 4 |
| (no listado) | 1 (piso mínimo) | | | |

Umbral: `score ≤ 10 → Normal` · `10 < score ≤ 20 → Alto` · `score > 20 → Crítico`
(ver `docs/anexo_e_f_v2.md` para la tabla completa y el detalle por host).

Cuando termines de clasificar los 12 hosts:
```
python docs/marcar.py
```

## 4. T3 — ciclo completo de Greenbone + redacción del informe

En el navegador (http://localhost:9392, `admin` / `admin123`), para cada host
Alto/Crítico (según tu clasificación del paso anterior):
1. Crear **Target** con la IP del host.
2. Crear **Task** con ese Target, perfil de escaneo **"Full and fast"**
   (mismo perfil que usa el workflow automatizado).
3. Lanzar el Task y esperar a que termine.
4. Abrir el **Report** y anotar los hallazgos (severidad, CVE si aplica).

Cuando termines TODOS los hosts **y** hayas redactado el resumen/informe de la
repetición:
```
python docs/marcar.py
```

El cronómetro va a mostrar el resumen de tiempos (Nmap / clasificación /
GVM+reporte / total) y agregar el registro a `docs/manual_arm_results.jsonl`.

---

## 5. Repetir

Repetí los pasos 0-4 para `--rep 2`, `--rep 3`, `--rep 4`, `--rep 5` (mismo
n que el brazo automatizado, 5 repeticiones).

## 6. Cerrar

Cuando tengas las 5 repeticiones reales:
```
node docs/analyze_manual_arm.js
```
Te da la fila "Manual" de la Tabla 4 (media y desvío estándar por fase) lista
para pegar en la tesis.

**Nota:** si algo sale mal a mitad de una repetición (contenedor caído, corte
de luz, etc.), no la cuentes — total o parcialmente comprometida, igual que
pasó con la repetición 4 del brazo automatizado (ver `docs/anexo_e_f_v2.md`).
Volvé a correr `python docs/cronometro_manual.py --rep N` con el mismo N
cuando reintentes esa repetición (el registro anterior queda en el archivo,
así que si repetís un número vas a tener que descartar el duplicado viejo a
mano en `docs/manual_arm_results.jsonl` antes de correr `analyze_manual_arm.js`).
