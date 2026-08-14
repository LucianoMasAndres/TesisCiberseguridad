# Imagen compartida para los servicios "legacy" del laboratorio de 12 activos.
# Un mismo Dockerfile instala varios demonios; cada contenedor levanta SOLO UNO
# (via entrypoint.sh <modo>), y se adjunta al namespace de red del host que le
# corresponde con network_mode: service:<anchor>. Ver docs/anexo_e_f_v2.md.
#
# Condiciones inseguras deliberadas (laboratorio controlado, ver README del repo):
#   - SSH: PermitRootLogin + PasswordAuthentication habilitados, credenciales debiles
#   - Telnet: protocolo en claro, login con credenciales debiles
#   - SNMP: community string "public" de lectura/escritura
#   - FTP: login anonimo habilitado
#   - SMB: recurso "publico" con acceso de invitado
#   - Postfix: mynetworks abierto (open relay)

FROM debian:11-slim

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    openssh-server \
    telnetd \
    snmpd \
    vsftpd \
    samba \
    postfix \
    && rm -rf /var/lib/apt/lists/*

# --- SSH (deliberadamente debil para el activo .12/.13/.14/.16/.19/.20) ---
RUN mkdir -p /var/run/sshd \
 && echo 'root:labpass123' | chpasswd \
 && sed -ri 's/^#?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
 && sed -ri 's/^#?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config

# --- Telnet (activo .17) ---
RUN useradd -m -s /bin/bash labuser && echo 'labuser:labuser' | chpasswd

# --- SNMP (activo .17) ---
RUN printf 'rocommunity public\nrwcommunity public\nsyslocation "Lab"\nsyscontact lab@local\n' > /etc/snmp/snmpd.conf

# --- FTP anonimo (activo .19/.21) ---
RUN mkdir -p /srv/ftp && chown ftp:ftp /srv/ftp \
 && mkdir -p /var/run/vsftpd/empty \
 && printf 'listen=YES\nanonymous_enable=YES\nanon_root=/srv/ftp\nwrite_enable=NO\nlocal_enable=NO\npasv_enable=NO\nsecure_chroot_dir=/var/run/vsftpd/empty\n' > /etc/vsftpd.conf

# --- SMB con guest share (activo .13/.20) ---
COPY smb.conf /etc/samba/smb.conf
RUN mkdir -p /srv/samba/publico && chmod 0777 /srv/samba/publico

# --- Postfix open relay (activo .16), con submission (587) habilitado ---
RUN postconf -e "mynetworks = 0.0.0.0/0" \
 && postconf -e "inet_interfaces = all" \
 && postconf -e "smtpd_relay_restrictions =" \
 && postconf -e "myhostname = mail.lab.local" \
 && echo "submission inet n       -       y       -       -       smtpd" >> /etc/postfix/master.cf

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
