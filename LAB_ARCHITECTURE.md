# Lab architecture

Guided Labs provide vetted instructions, commands, starter assets, checkpoints and optional evidence. Attempts record self-reported, instructor-reviewed or system-verified completion separately. Commands are instructional content.

Real Labs begin with an approved versioned NGINX Reverse Proxy template after Guided LMS gates pass. A durable job requests provisioning from an authenticated controller in a dedicated network zone. A session gateway accepts one-use, attempt-scoped grants and enforces ownership, expiry and revocation. A separately trusted checker reports results tied to template and checker versions.

Lifecycle: requested → queued → provisioning → ready → running → validating → passed/failed → stopping → destroyed. Provision failure, cancellation and expiration still require cleanup. Destroy is idempotent, cleanup failure triggers alerts and reconciliation. Enforce quotas for CPU, memory, disk, PIDs, time and concurrent sessions. Default-deny networking blocks the LMS data plane, management networks and metadata endpoints. Higher-privilege orchestration exercises require disposable VM or cluster isolation.
