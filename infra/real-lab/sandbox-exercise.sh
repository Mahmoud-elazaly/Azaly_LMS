#!/bin/sh
set -eu
directory=/run/azaly-lab
[ ! -e "$directory/verified" ] || exit 75

case "${1:-}:${2:-}" in
  linux-file-permissions@1:default) mask=022 ;;
  linux-file-permissions@1:private) mask=077 ;;
  prometheus-exposition@1:staging|prometheus-exposition@1:production)
    printf '# TYPE checkout_requests_total counter\ncheckout_requests_total{environment="%s"} 7\n' "$2" > "$directory/metrics.next"
    mv "$directory/metrics.next" "$directory/metrics"
    printf 'environment=%s\n' "$2" > "$directory/exercise.conf"
    exit 0
    ;;
  *) exit 2 ;;
esac

rm -f "$directory/example.next"
umask "$mask"
printf '%s\n' 'Sample application settings' > "$directory/example.next"
mv "$directory/example.next" "$directory/example"
printf 'umask %s\n' "$mask" > "$directory/exercise.conf"
