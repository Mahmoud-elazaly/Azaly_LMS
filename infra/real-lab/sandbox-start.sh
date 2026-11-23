#!/bin/sh
set -eu
case "${LAB_EXPIRES_EPOCH:-}" in
  ''|*[!0-9]*) exit 2 ;;
esac
remaining=$((LAB_EXPIRES_EPOCH - $(date +%s)))
[ "$remaining" -gt 0 ] && [ "$remaining" -le 960 ]
printf '%s\n' 'proxy_pass http://127.0.0.1:8082;' > /run/azaly-lab/route.conf
exec timeout -k 2 "$remaining" nginx -c /opt/azaly-lab/nginx.conf -g 'daemon off;'
