#!/usr/bin/env bash

phase7_control_subnet() {
  python3 - <<'PY'
import ipaddress, json, secrets, subprocess
network_ids = subprocess.check_output(["docker", "network", "ls", "-q"], text=True).split()
networks = json.loads(subprocess.check_output(["docker", "network", "inspect", *network_ids], text=True))
used = [ipaddress.ip_network(entry["Subnet"]) for network in networks
        for entry in network["IPAM"].get("Config") or [] if entry.get("Subnet")]
pool = list(ipaddress.ip_network("10.246.0.0/16").subnets(new_prefix=28))
secrets.SystemRandom().shuffle(pool)
print(next(candidate for candidate in pool if not any(candidate.overlaps(network) for network in used)))
PY
}

phase7_sql() {
  dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -At -U academy -d academy "$@"
}

phase7_legacy_digest() {
  phase7_sql <<'SQL'
SELECT md5(jsonb_build_array(
  (SELECT to_jsonb(u) FROM identity."user" u WHERE id='phase7-upgrade'),
  (SELECT to_jsonb(a) FROM identity.account a WHERE id='phase7-upgrade'),
  (SELECT to_jsonb(s) FROM identity.session s WHERE id='phase7-upgrade'),
  (SELECT to_jsonb(i) FROM identity.invitation i WHERE id='phase7-upgrade'),
  (SELECT to_jsonb(c) FROM courses c WHERE slug='phase7-existing'),
  (SELECT to_jsonb(v) FROM course_versions v WHERE id='3e19c19d-ce8f-4bab-85fe-cd8d711ebd71')
)::text);
SQL
}

phase7_upgrade() {
  phase7_legacy_dir="$(mktemp -d)"
  chmod 755 "$phase7_legacy_dir"
  mkdir "$phase7_legacy_dir/meta"
  cp src/db/migrations/000[0-7]_*.sql "$phase7_legacy_dir/"
  python3 - "$phase7_legacy_dir/meta/_journal.json" <<'PY'
import json, pathlib, sys
baseline = json.loads(pathlib.Path('src/db/migrations/meta/_journal.json').read_text())
baseline['entries'] = [entry for entry in baseline['entries'] if entry['idx'] < 8]
pathlib.Path(sys.argv[1]).write_text(json.dumps(baseline))
PY
  dc build migrate
  dc run --rm -T -v "$phase7_legacy_dir:/app/src/db/migrations:ro" migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 8
  phase7_sql <<'SQL'
INSERT INTO identity."user" (id,name,email) VALUES ('phase7-upgrade','Upgrade learner','upgrade@sql.example.test');
INSERT INTO identity.account (id,account_id,provider_id,user_id,password)
  VALUES ('phase7-upgrade','phase7-upgrade','credential','phase7-upgrade','synthetic-credential-hash');
INSERT INTO identity.session (id,token,user_id,expires_at)
  VALUES ('phase7-upgrade','phase7-upgrade-token','phase7-upgrade',now()+interval '1 day');
INSERT INTO identity.invitation (id,name,email,role,locale,token_hash,expires_at,created_by)
  VALUES ('phase7-upgrade','Invitee','invitee@sql.example.test','STUDENT','ar',
    repeat('7',64),now()+interval '1 day','phase7-upgrade');
WITH course AS (INSERT INTO courses(slug) VALUES ('phase7-existing') RETURNING id)
INSERT INTO course_versions(id,course_id,revision,published_at)
  SELECT '3e19c19d-ce8f-4bab-85fe-cd8d711ebd71', id, 1, now() FROM course;
SQL
  local before
  before="$(phase7_legacy_digest)"
  dc run --rm migrate
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 9
  test "$before" = "$(phase7_legacy_digest)"
  phase7_sql <<'SQL'
DELETE FROM identity.invitation WHERE id='phase7-upgrade';
DELETE FROM identity."user" WHERE id='phase7-upgrade';
DELETE FROM course_versions WHERE id='3e19c19d-ce8f-4bab-85fe-cd8d711ebd71';
DELETE FROM courses WHERE slug='phase7-existing';
SQL
  echo 'Phase 7 upgraded the v0.5.0 fixtures and preserved course, user, credential, session and invitation rows.'
}

phase7_start_services() {
  local bridge_password
  bridge_password="$(openssl rand -hex 32)"
  export LAB_CONTROLLER_SECRET="$(openssl rand -hex 32)"
  export LAB_CONTROLLER_URL=http://lab-controller:8401
  export REAL_LAB_DATABASE_URL="postgresql://academy_real_lab_bridge:$bridge_password@postgres:5432/academy"
  printf '{"password":"%s"}\n' "$bridge_password" |
    dc run --rm -T migrate node scripts/identity-admin.mjs provision-real-lab
  docker build --target lab-sandbox -t "$project-lab-sandbox" .
  export LAB_SANDBOX_IMAGE="$(docker image inspect "$project-lab-sandbox" --format '{{.Id}}')"
  dc up -d --build --wait lab-controller lab-bridge
}

phase7_destroy_test_labs() {
  local lab_ids attempt
  local containers
  dc stop lab-bridge lab-controller >/dev/null 2>&1 || true
  # Give any Docker request already dispatched by the stopped controller time to appear.
  for attempt in 1 2 3; do
    lab_ids="$(docker ps -aq --filter "label=azaly.real-lab.project=$project")" || return 1
    if [[ -n "$lab_ids" ]]; then
      mapfile -t containers <<< "$lab_ids"
      docker rm -f "${containers[@]}" >/dev/null 2>&1 || true
    fi
    [[ "$attempt" == 3 ]] || sleep 1
  done
  if [[ -n "${phase7_legacy_dir:-}" ]]; then rm -r -- "$phase7_legacy_dir" || return 1; fi
  lab_ids="$(docker ps -aq --filter "label=azaly.real-lab.project=$project")" || return 1
  test -z "$lab_ids"
}

phase7_provision_fixture() {
  dc exec -T lab-controller node --input-type=module -e '
    const [id, duration] = process.argv.slice(1);
    const response = await fetch("http://127.0.0.1:8401/control", {
      method: "POST", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${process.env.LAB_CONTROLLER_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "provision", templateVersion: "nginx-reverse-proxy@1", id,
        expiresAt: new Date(Date.now() + Number(duration)).toISOString() }),
    });
    if (!response.ok || !(await response.json()).ok) throw new Error("Lab fixture did not start");
  ' "$1" "$2"
}

phase7_wait_until_removed() {
  local attempt id
  id="$1"
  for attempt in $(seq 1 20); do
    if [[ -z "$(docker ps -aq --filter "label=azaly.real-lab.project=$project" --filter "label=azaly.real-lab.attempt=$id")" ]]; then return 0; fi
    sleep 1
  done
  return 1
}

phase7_check_worker() {
  dc stop lab-bridge
  local orphan='77cff25f-975a-42aa-b240-cc638d463256'
  local short_lived='7ee88746-6d94-4efd-ac0e-bbfc86971496'
  local sandbox db_ip web_ip
  test -z "$(docker ps -aq --filter "label=azaly.real-lab.project=$project")"
  phase7_provision_fixture "$orphan" 120000
  sandbox="$(docker ps -q --filter "label=azaly.real-lab.project=$project" --filter "label=azaly.real-lab.attempt=$orphan")"
  test -n "$sandbox"
  docker inspect "$sandbox" | python3 -c '
import json, sys
lab, = json.load(sys.stdin)
host = lab["HostConfig"]
assert lab["Config"]["User"] == "101:101"
assert not host["Privileged"] and host["ReadonlyRootfs"] and host["AutoRemove"]
assert host["NetworkMode"] == "none" and set(lab["NetworkSettings"]["Networks"]) == {"none"}
assert not host["PublishAllPorts"] and not host["PortBindings"]
assert host["CapDrop"] == ["ALL"] and not host["CapAdd"] and "no-new-privileges" in host["SecurityOpt"]
assert host["NanoCpus"] == 250000000 and host["Memory"] == 48 * 1024 ** 2 and host["MemorySwap"] == host["Memory"]
assert host["PidsLimit"] == 24 and host["LogConfig"]["Type"] == "none" and not host["Binds"]
assert set(host["Tmpfs"]) == {"/tmp", "/run/azaly-lab"}
assert all("size=1m" in options and "noexec" in options for options in host["Tmpfs"].values())
'
  docker inspect "$container" "$(dc ps -aq lab-bridge)" | python3 -c '
import json, sys
for service in json.load(sys.stdin):
    assert all(not mount["Destination"].endswith("docker.sock") for mount in service["Mounts"])
'
  docker inspect "$(dc ps -q lab-controller)" | python3 -c '
import json, sys
controller, = json.load(sys.stdin)
networks = controller["NetworkSettings"]["Networks"]
assert len(networks) == 1 and next(iter(networks)).endswith("_lab-control")
assert all(not item.startswith(("DATABASE_URL=", "REAL_LAB_DATABASE_URL=")) for item in controller["Config"]["Env"])
'
  dc exec -T lab-controller node -e '
    fetch("http://127.0.0.1:8401/control", { method: "POST", body: "{}" }).then(response => {
      if (response.status !== 403) throw new Error("Controller accepted an unauthenticated request");
    });
  '
  db_ip="$(docker inspect "$(dc ps -q postgres)" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
  web_ip="$(docker inspect "$container" --format "{{with index .NetworkSettings.Networks \"${project}_data\"}}{{.IPAddress}}{{end}}")"
  test -n "$db_ip" && test -n "$web_ip"
  docker exec "$sandbox" sh -ec '
    test "$(id -u)" = 101
    test ! -e /var/run/docker.sock
    test "$(wget -T 1 -qO- http://127.0.0.1:8080/)" = upstream-green
    for target do
      if ip route get "$target" >/dev/null 2>&1; then exit 1; fi
    done
  ' sh "$db_ip" "$web_ip" 169.254.169.254 1.1.1.1
  echo 'Sandbox resource limits, filesystem and socket restrictions, and lack of routes to the LMS and metadata passed.'

  dc exec -T lab-controller node --input-type=module -e '
    async function control(operation, upstream, expectedStatus = 200) {
      const response = await fetch("http://127.0.0.1:8401/control", {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${process.env.LAB_CONTROLLER_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: process.argv[1], operation, upstream, templateVersion: "nginx-reverse-proxy@1" }),
      });
      if (response.status !== expectedStatus) throw new Error(`Unexpected ${operation} status: ${response.status}`);
      return response.json();
    }
    await control("apply", "blue");
    const check = await control("check");
    if (!check.configurationOk || !check.responseOk) throw new Error("Blue route did not pass verification");
    await control("apply", "green", 409);
    if ((await control("preview")).body !== "upstream-blue") throw new Error("A late edit changed the verified route");
  ' "$orphan"
  echo 'The worker rejected a configuration edit arriving after a successful check.'

  dc restart lab-controller
  dc up -d --wait lab-controller
  dc up -d --wait lab-bridge
  phase7_wait_until_removed "$orphan"
  echo 'An orphan survived controller restart and was removed by the restored bridge reconciliation.'

  dc stop lab-bridge
  phase7_provision_fixture "$short_lived" 15000
  dc stop lab-controller
  test -n "$(docker ps -q --filter "label=azaly.real-lab.project=$project" --filter "label=azaly.real-lab.attempt=$short_lived")"
  phase7_wait_until_removed "$short_lived"
  echo 'The sandbox exited at expiry and Docker removed it with the controller and bridge stopped.'
}
