# Versiones del entorno de la campaña

Este archivo deja constancia de qué versiones exactas produjeron los datos de
`docs/experiment_results.jsonl` (campaña del 14/08/2026, de 19:16 a 21:42 UTC).
El `docker-compose.yml` usa etiquetas mutables para Greenbone (`:stable`,
`:latest`) porque los digests de las imágenes de feed dejan de resolver en el
registro al cabo de un tiempo; por eso las versiones se registran acá y no en el
archivo de composición.

## Cómo se obtuvo cada dato

| Dato | Origen | Alcance |
|---|---|---|
| Digests de las imágenes de Greenbone | Commit `792bc30` (14/08/2026, 23:32 UTC), que fijó en el `docker-compose.yml` los digests de las imágenes presentes en el equipo al terminar la campaña | Registro hecho el día de la campaña |
| Versiones de Nmap, gvm-tools, python-gvm y n8n | Consulta del 04/10/2026 a la imagen `tesisciberseguridad-n8n` construida el 14/08/2026 a las 15:37 UTC (id `sha256:95a898604f34…`), la última construida antes de la campaña | Medido sobre la imagen de la campaña |
| Versiones de gvmd, OpenVAS, ospd-openvas y GSA | Consulta del 04/10/2026 a los contenedores, cuyas imágenes tienen el mismo digest que registró `792bc30` | Medido sobre las mismas imágenes |
| Versión del feed de NVT | No se registró durante la campaña | Solo el digest de la imagen |

## Imágenes de Greenbone (digests del 14/08/2026)

Todas del registro `registry.community.greenbone.net/community/`.

| Imagen | Digest |
|---|---|
| `vulnerability-tests` | `sha256:f044dfd33537f79e57d394998d10e137ac67b245c571f42412fc763dc4151432` |
| `notus-data` | `sha256:38ab33b37658fa59e546f4ae40e8fef56003052bb0208d71d085a3b3038f16b2` |
| `scap-data` | `sha256:3d5be56374de35163bae3097f51668c14942d2187229b821f44b45dd878b65ba` |
| `cert-bund-data` | `sha256:7b195f11a3f5cd795a73d90e1d41257cc06b0a7ffb58c8aac0a3473515034cd8` |
| `dfn-cert-data` | `sha256:37d61403a8e2be0957fda5247e9baff80f20b7b8b55f96d51e2e86e910068eb7` |
| `data-objects` | `sha256:a8923a7ec89e9d67f6a3da4ca2f017910147ccad67eac687ab4c421387edd1a6` |
| `report-formats` | `sha256:53574fa38cd7f33d14e01983dd5a40b4b4deccb8fcf88163f6f01789c1aa7f8b` |
| `gpg-data` | `sha256:836bd24bf820dc6eef57b109a9c9b1f88c8e651edcdf4a00c835b9524c132a7b` |
| `redis-server` | `sha256:6da6a7c7221aa3ab231961fd6ca001d552b6a2c7727ac6201c6d8a360baa963a` |
| `pg-gvm` | `sha256:9f33165496bfa2676cb37137bb9dfbc72438ecb92e4a7c07bcd18a0eedbac1a6` |
| `gvmd` | `sha256:0c6357d0c4b6da462edf0c1d1429949e920a00693dc2aa18bbc85a9e17e34138` |
| `gsa` | `sha256:94195849bc0324b568b94672bf1dd1ebf3381ebccd15d7ecfa05cf46d40b7b66` |
| `openvas-scanner` | `sha256:ea77510c9fe89756d19eb40791d2e2b25dfb8e60e23615b97a5b98cb874d5bc5` |
| `ospd-openvas` | `sha256:b8507be8e4cf34a84cc02c216817f86b347a984ecdbe0b68c759b094efd626c9` |
| `gvm-tools` | `sha256:c632fa9367e0f64c0c67b989d96279b12eae811acfde5cc06602bf64b15deea6` |

Otras imágenes: `axllent/mailpit@sha256:956d688cbd13dca36c72d8e94c34d6d1cdf4a005aa6aa4ff6edaaac56c34d8df`
y la base `n8nio/n8n@sha256:cf11c96b0d0089bb24459bf97b445fd7008f41543b673cce4d955f7c0ed8752d`,
las dos fijadas por digest en el repositorio.

## Versiones de los componentes

| Componente | Versión |
|---|---|
| n8n | 2.27.4 |
| Nmap | 7.95 (paquete `nmap-7.95-r0` de Alpine 3.20) |
| gvm-tools | 26.0.7 |
| python-gvm | 27.6.0 |
| Python (entorno de gvm-tools) | 3.12.13 |
| gvmd (Greenbone Vulnerability Manager) | 26.31.1 (revisión 279 de la base); protocolo GMP 22.7 |
| OpenVAS (openvas-scanner) | 23.38.1 |
| ospd-openvas | 22.10.1 |
| GSA (gsad) | 26.4.0 |
| PostgreSQL (pg-gvm) | 17.9 |
| Docker Engine / Docker Compose | 29.2.1 / v5.0.2 |

El `n8n_custom/Dockerfile` fija `gvm-tools==26.0.7` y `python-gvm==27.6.0`, y
restringe Nmap a la serie 7.95.

## Lo que no quedó registrado

- **Versión del feed de NVT.** La campaña usó la imagen `vulnerability-tests` del
  digest de arriba, pero no se anotó la versión del feed que reporta gvmd
  (`get_feeds`). Ese digest ya no resuelve en el registro. La imagen presente en el
  equipo desde el 17/08/2026 es otra (`sha256:b986fac3152c…`, feed 202608170616), y
  es la que usaron la repetición del operador 1 de la remedición manual de
  septiembre de 2026 y las corridas de control. El operador 2 trabajó en otro
  equipo, con su propia instancia del laboratorio: la versión del feed de esa
  instancia no se registró.
- **Etiquetas de tres imágenes.** El 17/08/2026 (commit `e27bc4d`) `gpg-data` y
  `redis-server` pasaron de `:latest` a `:stable`, y `gvm-tools`, de `:latest` a
  `:stable`; sus digests actuales difieren de los de la tabla.

## Cómo repetir la consulta

```bash
docker compose images
docker exec n8n-security-lab sh -c 'n8n --version; nmap --version | head -1; /home/node/gvm-env/bin/pip list | grep -i gvm'
docker exec greenbone-community-edition-gvmd-1 gvmd --version
docker exec n8n-security-lab /home/node/gvm-env/bin/gvm-cli --gmp-username admin --gmp-password admin123 \
  socket --socketpath /run/gvmd/gvmd.sock --xml '<get_feeds/>'
```
