#!/bin/sh
set -eu
case "${LAB_EXPIRES_EPOCH:-}" in
  ''|*[!0-9]*) exit 2 ;;
esac
remaining=$((LAB_EXPIRES_EPOCH - $(date +%s)))
if [ "$remaining" -le 0 ] || [ "$remaining" -gt 960 ]; then exit 2; fi

case "${LAB_TEMPLATE_VERSION:-nginx-reverse-proxy@1}" in
  nginx-reverse-proxy@1)
    printf '%s\n' 'proxy_pass http://127.0.0.1:8082;' > /run/azaly-lab/route.conf
    exec timeout -k 2 "$remaining" nginx -c /opt/azaly-lab/nginx.conf -g 'daemon off;'
    ;;
  linux-file-permissions@1)
    /bin/sh /opt/azaly-lab/sandbox-exercise.sh linux-file-permissions@1 default
    exec sleep "$remaining"
    ;;
  prometheus-exposition@1)
    /bin/sh /opt/azaly-lab/sandbox-exercise.sh prometheus-exposition@1 staging
    exec timeout -k 2 "$remaining" nginx -c /opt/azaly-lab/metrics-nginx.conf -g 'daemon off;'
    ;;
  *) exit 2 ;;
esac
