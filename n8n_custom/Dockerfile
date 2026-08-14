# --- Stage 1: Get the installer and libraries from a standard Alpine image ---
FROM alpine:3.20 AS builder

# --- Stage 2: Build the custom n8n image ---
FROM n8nio/n8n:latest

USER root

# 1. "Restore" the apk package manager
COPY --from=builder /sbin/apk /sbin/apk
COPY --from=builder /lib/libapk.so* /lib/
COPY --from=builder /lib/libz.so* /lib/
COPY --from=builder /etc/apk /etc/apk
COPY --from=builder /usr/share/apk /usr/share/apk

# 2. Setup permissions
RUN chown -R root:root /lib/libapk.so* /lib/libz.so* /sbin/apk /etc/apk

# 3. Install tools (Added 'tini' here)
RUN mkdir -p /var/cache/apk \
    && /sbin/apk update \
    && /sbin/apk add --no-cache \
    tini \
    nmap \
    nmap-scripts \
    libcap \
    python3 \
    py3-pip \
    bash \
    curl \
    ca-certificates

# El contenedor corre como usuario no privilegiado 'node' (ver docs/anexo_e_f_v2.md
# y hallazgo A8 de la auditoria 2026-08-04: Nmap requiere privilegios para -sS/-sU/-sn,
# y sin ellos degrada silenciosamente a un escaneo TCP connect incompleto).
# Se probo setcap (Linux capabilities) primero, pero no se propaga de forma
# confiable dentro de este entorno de contenedor (limitacion conocida de ciertos
# backends de Docker Desktop con filesystems overlay). Se usa en su lugar el bit
# setuid sobre el binario, que es el metodo que la propia documentacion de Nmap
# recomienda como alternativa (https://nmap.org/book/install.html).
RUN chmod u+s /usr/bin/nmap

USER node

# 4. Create Python virtual environment and install gvm-tools
RUN python3 -m venv /home/node/gvm-env \
    && /home/node/gvm-env/bin/pip install --no-cache-dir gvm-tools

# Add virtual environment to PATH
ENV PATH="/home/node/gvm-env/bin:$PATH"
