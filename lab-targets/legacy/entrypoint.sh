#!/bin/bash
set -e

MODE="$1"

case "$MODE" in
  ssh)
    mkdir -p /var/run/sshd
    exec /usr/sbin/sshd -D -e
    ;;
  telnet)
    # -debug <puerto> lo hace correr standalone escuchando ese puerto,
    # en vez de esperar un socket pasado por inetd (que no existe aca).
    exec /usr/sbin/in.telnetd -debug 23 -L /bin/login
    ;;
  snmp)
    exec /usr/sbin/snmpd -f -Lo -c /etc/snmp/snmpd.conf
    ;;
  ftp)
    exec /usr/sbin/vsftpd /etc/vsftpd.conf
    ;;
  smb)
    mkdir -p /var/lib/samba /var/run/samba /var/log/samba
    exec /usr/sbin/smbd --foreground --no-process-group -s /etc/samba/smb.conf
    ;;
  postfix)
    /usr/sbin/postfix set-permissions >/dev/null 2>&1 || true
    exec /usr/sbin/postfix start-fg
    ;;
  *)
    echo "Modo desconocido: $MODE (usar: ssh|telnet|snmp|ftp|smb|postfix)" >&2
    exit 1
    ;;
esac
