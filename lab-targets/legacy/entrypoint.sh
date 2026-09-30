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
    # En ese modo atiende UNA conexion y termina: con un solo exec, el primer
    # sondeo (Nmap o Greenbone) dejaba al activo .17 sin el puerto 23 para el
    # resto de la sesion, como en las repeticiones 1 a 4 de la campana del
    # 14/08/2026. El bucle lo vuelve a lanzar despues de cada conexion.
    trap 'kill "$pid" 2>/dev/null; exit 0' TERM INT
    while true; do
      /usr/sbin/in.telnetd -debug 23 -L /bin/login &
      pid=$!
      wait "$pid" || sleep 1
    done
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
