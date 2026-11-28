#!/usr/bin/env bash

phase12_legacy_digest() {
  phase9_legacy_digest
  phase7_sql <<'SQL'
WITH original AS (
  SELECT * FROM knowledge.concepts WHERE slug NOT IN ('linux-file-permissions','prometheus-exposition')
)
SELECT md5(jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY slug) FROM original c),
  (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM knowledge.concept_edges e
    JOIN original source ON source.id = e.source_concept_id JOIN original target ON target.id = e.target_concept_id),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY lesson_id, concept_id) FROM knowledge.lesson_concepts m),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY question_id, concept_id) FROM knowledge.question_concepts m),
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY course_slug, lab_id, real_template_version, concept_id)
    FROM knowledge.lab_concepts m JOIN original c ON c.id = m.concept_id)
)::text);
SQL
}

phase12_upgrade() {
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 13
  local before
  before="$(phase12_legacy_digest)"
  phase7_migration_slice 14
  phase7_migration_slice 14
  test "$(phase7_sql -c 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = 14
  test "$before" = "$(phase12_legacy_digest)"
  echo 'Phase 12 upgraded and replayed v1.0.0 while preserving both lab models and prior evidence.'
}

phase12_check_worker() {
  local linux='97cff25f-975a-42aa-b240-cc638d463256'
  local metrics='9ee88746-6d94-4efd-ac0e-bbfc86971496'
  local sandboxes
  dc stop lab-bridge
  phase7_provision_fixture "$linux" 45000 'linux-file-permissions@1'
  phase7_provision_fixture "$metrics" 45000 'prometheus-exposition@1'
  mapfile -t sandboxes < <(docker ps -q --filter "label=azaly.real-lab.project=$project")
  test "${#sandboxes[@]}" = 2
  docker inspect "${sandboxes[@]}" | python3 -c '
import json, sys
labs = json.load(sys.stdin)
assert {lab["Config"]["Labels"]["azaly.real-lab.template"] for lab in labs} == {
    "linux-file-permissions@1", "prometheus-exposition@1",
}
for lab in labs:
    host = lab["HostConfig"]
    assert lab["Config"]["User"] == "101:101" and host["AutoRemove"]
    assert host["NetworkMode"] == "none" and not host["PortBindings"] and not host["PublishAllPorts"]
    assert host["CapDrop"] == ["ALL"] and not host["CapAdd"] and "no-new-privileges" in host["SecurityOpt"]
    assert host["ReadonlyRootfs"] and not host["Privileged"] and not host["Binds"]
    assert host["Memory"] == host["MemorySwap"] == 48 * 1024 ** 2
    assert host["NanoCpus"] == 250000000 and host["PidsLimit"] == 24 and host["LogConfig"]["Type"] == "none"
    assert set(host["Tmpfs"]) == {"/tmp", "/run/azaly-lab"}
    assert all("size=1m" in options and "noexec" in options for options in host["Tmpfs"].values())
'
  dc exec -T lab-controller node -e '
    fetch("http://127.0.0.1:8401/control", {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${process.env.LAB_CONTROLLER_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "preview", templateVersion: "prometheus-exposition@1", id: process.argv[1] }),
    }).then(response => {
      if (response.status !== 409) throw new Error("Controller accepted an attempt under the wrong template");
    });
  ' "$linux"
  dc stop lab-controller
  phase7_wait_until_removed "$linux" 55
  phase7_wait_until_removed "$metrics" 55
  dc up -d --wait lab-controller lab-bridge
  echo 'The Linux and metrics sandboxes retained worker isolation and self-removed with the bridge and controller stopped.'
}
