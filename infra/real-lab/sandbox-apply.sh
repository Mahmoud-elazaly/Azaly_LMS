#!/bin/sh
set -eu
case "${1:-}" in
  blue) port=8081; expected=upstream-blue ;;
  green) port=8082; expected=upstream-green ;;
  *) exit 2 ;;
esac
directory=/run/azaly-lab
[ ! -e "$directory/verified" ] || exit 75
printf 'proxy_pass http://127.0.0.1:%s;\n' "$port" > "$directory/route.next"
mv "$directory/route.next" "$directory/route.conf"
nginx -c /opt/azaly-lab/nginx.conf -s reload
for attempt in 1 2 3 4 5 6 7 8; do
  if [ "$(wget -T 1 -qO- http://127.0.0.1:8080/ || true)" = "$expected" ]; then exit 0; fi
  sleep 0.2
done
exit 1
