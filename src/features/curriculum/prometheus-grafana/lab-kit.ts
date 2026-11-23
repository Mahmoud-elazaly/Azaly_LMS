export const composeFile = `services:
  prometheus:
    image: prom/prometheus:v3.16.0
    ports: ["127.0.0.1:19090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./rules.yml:/etc/prometheus/rules.yml:ro
      - prometheus-data:/prometheus
  sample:
    image: busybox:1.37.0
    command: [httpd, -f, -p, "8080", -h, /www]
    volumes:
      - ./sample:/www:ro
  grafana:
    image: grafana/grafana:13.3.1
    ports: ["127.0.0.1:13000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: \${LAB_GRAFANA_PASSWORD:?Set a local practice password}
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
      GF_ANALYTICS_CHECK_FOR_UPDATES: "false"
      GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES: "false"
    volumes:
      - ./datasource.yml:/etc/grafana/provisioning/datasources/prometheus.yml:ro
      - grafana-data:/var/lib/grafana
  alertmanager:
    image: prom/alertmanager:v0.35.0
    ports: ["127.0.0.1:19093:9093"]
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager-data:/alertmanager
volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:`;

export const prometheusConfig = `global:
  scrape_interval: 15s
  evaluation_interval: 15s
rule_files: [rules.yml]
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["alertmanager:9093"]
scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["prometheus:9090"]
  - job_name: sample
    fallback_scrape_protocol: PrometheusText0.0.4
    static_configs:
      - targets: ["sample:8080"]`;

export const sampleMetrics = `# HELP demo_requests_total Synthetic HTTP requests since the process started.
# TYPE demo_requests_total counter
demo_requests_total{method="GET",status="200"} 180
demo_requests_total{method="GET",status="500"} 20
# HELP demo_queue_depth Current synthetic jobs waiting.
# TYPE demo_queue_depth gauge
demo_queue_depth 3
# HELP demo_request_duration_seconds Synthetic HTTP request duration in seconds.
# TYPE demo_request_duration_seconds histogram
demo_request_duration_seconds_bucket{le="0.1"} 120
demo_request_duration_seconds_bucket{le="0.3"} 180
demo_request_duration_seconds_bucket{le="1"} 198
demo_request_duration_seconds_bucket{le="+Inf"} 200
demo_request_duration_seconds_sum 35
demo_request_duration_seconds_count 200
`;

export const datasourceConfig = `apiVersion: 1
datasources:
  - name: Practice Prometheus
    uid: practice-prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      httpMethod: POST
      timeInterval: 15s`;

export const prometheusRules = `groups:
  - name: practice
    rules:
      - record: job:prometheus_http_requests:rate2m
        expr: sum by (job) (rate(prometheus_http_requests_total[2m]))
      - alert: SampleTargetDown
        expr: up{job="sample"} == 0
        for: 45s
        labels:
          severity: warning
        annotations:
          summary: "Practice target {{ $labels.instance }} cannot be scraped"`;

export const alertmanagerConfig = `route:
  receiver: practice-inbox
  group_by: [alertname, job]
  group_wait: 5s
  group_interval: 30s
  repeat_interval: 1h
receivers:
  - name: practice-inbox`;

export const startCommands = `export LAB_GRAFANA_PASSWORD="\${LAB_GRAFANA_PASSWORD:-$(openssl rand -hex 24)}"
docker compose config --quiet
docker compose up -d
curl -fsS http://127.0.0.1:19090/-/ready
curl -fsS http://127.0.0.1:13000/api/health
curl -fsS http://127.0.0.1:19093/-/ready`;

export const targetsQuery = `curl -fsSG http://127.0.0.1:19090/api/v1/query \\
  --data-urlencode 'query=up{job=~"prometheus|sample"}'`;

export const trafficCommand = `for request in 1 2 3 4 5; do
  curl -fsSG http://127.0.0.1:19090/api/v1/query --data-urlencode 'query=vector(1)' >/dev/null
  sleep 5
done`;

export const validateRulesCommands = `docker compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec -T prometheus promtool check rules /etc/prometheus/rules.yml
docker compose exec -T alertmanager amtool check-config /etc/alertmanager/alertmanager.yml`;

export const labFiles = {
  'compose.yaml': composeFile,
  'prometheus.yml': prometheusConfig,
  'sample/metrics': sampleMetrics,
  'datasource.yml': datasourceConfig,
  'rules.yml': prometheusRules,
  'alertmanager.yml': alertmanagerConfig,
};
