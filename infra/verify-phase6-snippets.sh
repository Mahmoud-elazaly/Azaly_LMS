#!/usr/bin/env bash
set -euo pipefail
project="${1:?Provide the isolated practice project name}"
[[ "$project" =~ ^academy-phase[679]-[0-9a-f]{12}-practice$ ]]
directory="$(mktemp -d)"
export LAB_GRAFANA_PASSWORD="$(openssl rand -hex 24)"
dc() { docker compose -p "$project" --project-directory "$directory" -f "$directory/compose.yaml" "$@"; }
cleanup() {
  local result=$?
  if [[ -f "$directory/compose.yaml" ]]; then
    if ((result != 0)); then dc logs --tail 30 >&2 || true; fi
    dc down --volumes >&2 || true
  fi
  rm -r -- "$directory"
  return "$result"
}
trap cleanup EXIT

python3 -c '
import json, pathlib, sys
directory = pathlib.Path(sys.argv[1])
files = json.load(sys.stdin)
assert set(files) == {"compose.yaml", "prometheus.yml", "rules.yml", "sample/metrics", "datasource.yml", "alertmanager.yml"}
for name, content in files.items():
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
' "$directory"

dc config --quiet
# Let Docker choose free host ports for verification. The learner-facing bindings stay on loopback.
sed -i -E 's/127\.0\.0\.1:[0-9]+:/127.0.0.1::/g' "$directory/compose.yaml"
dc up -d
prometheus="http://$(dc port prometheus 9090)"
grafana="http://$(dc port grafana 3000)"
alertmanager="http://$(dc port alertmanager 9093)"

wait_for() {
  local attempt
  for attempt in $(seq 1 100); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $*" >&2
  return 1
}
query() { curl -fsSG --max-time 5 "$prometheus/api/v1/query" --data-urlencode "query=$1"; }
assert_json() { python3 -c "import json, sys; data = json.load(sys.stdin); assert $1"; }
healthy_targets() {
  query 'up{job=~"prometheus|sample"}' |
    assert_json 'sorted((item["metric"]["job"], item["value"][1]) for item in data["data"]["result"]) == [("prometheus", "1"), ("sample", "1")]'
}
alert_state() {
  curl -fsS --max-time 5 "$prometheus/api/v1/alerts" |
    assert_json "any(alert['labels']['alertname'] == 'SampleTargetDown' and alert['state'] == '$1' for alert in data['data']['alerts'])"
}
alert_delivered() {
  curl -fsS --max-time 5 "$alertmanager/api/v2/alerts" |
    assert_json 'any(alert["labels"]["alertname"] == "SampleTargetDown" for alert in data)'
}
alert_cleared() {
  curl -fsS --max-time 5 "$prometheus/api/v1/alerts" |
    assert_json 'all(alert["labels"]["alertname"] != "SampleTargetDown" for alert in data["data"]["alerts"])'
}
recording_available() {
  query 'job:prometheus_http_requests:rate2m' |
    assert_json 'len(data["data"]["result"]) == 1 and float(data["data"]["result"][0]["value"][1]) >= 0'
}
datasource_ready() {
  curl -fsS --max-time 5 -u "admin:$LAB_GRAFANA_PASSWORD" "$grafana/api/datasources/uid/practice-prometheus/health" |
    assert_json 'data["status"] == "OK"'
}

wait_for curl -fsS --max-time 5 "$prometheus/-/ready"
wait_for curl -fsS --max-time 5 "$grafana/api/health"
wait_for curl -fsS --max-time 5 "$alertmanager/-/ready"
dc exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
dc exec -T prometheus promtool check rules /etc/prometheus/rules.yml
dc exec -T alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
wait_for healthy_targets
wait_for datasource_ready
query 'sum(demo_requests_total{status=~"5.."}) / sum(demo_requests_total)' |
  assert_json 'float(data["data"]["result"][0]["value"][1]) == 0.1'
query 'histogram_quantile(0.95, sum by (le) (demo_request_duration_seconds_bucket))' |
  assert_json 'abs(float(data["data"]["result"][0]["value"][1]) - 0.69) < 0.01'
wait_for recording_available

dc stop sample
wait_for alert_state pending
wait_for alert_state firing
wait_for alert_delivered
query 'up{job="sample"}' | assert_json 'data["data"]["result"][0]["value"][1] == "0"'
query 'up{job="never-configured"}' | assert_json 'data["data"]["result"] == []'
dc start sample
wait_for healthy_targets
wait_for alert_cleared
echo 'Practice stack passed configuration, scrapes, PromQL, Grafana data source, and alert delivery/recovery checks.'
