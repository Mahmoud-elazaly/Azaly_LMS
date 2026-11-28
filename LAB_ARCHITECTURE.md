# Lab architecture

Guided Labs provide vetted instructions, commands, starter assets, checkpoints and optional evidence. Guided Lab attempts record self-reported completion and can receive an instructor review. System-verified completion belongs to the separate Real Lab checker. Guided Lab commands are instructional content.

Real Labs begin with an approved versioned NGINX Reverse Proxy template after Guided LMS gates pass. A durable job requests provisioning from an authenticated controller in a dedicated network zone. A session gateway accepts one-use, attempt-scoped grants and enforces ownership, expiry and revocation. A separately trusted checker reports results tied to template and checker versions.

Lifecycle: requested → queued → provisioning → ready → running → validating → passed/failed → stopping → destroyed. Provision failure, cancellation and expiration still require cleanup. Destroy is idempotent, cleanup failure triggers alerts and reconciliation. Enforce quotas for CPU, memory, disk, PIDs, time and concurrent sessions. Default-deny networking blocks the LMS data plane, management networks and metadata endpoints. Higher-privilege orchestration exercises require disposable VM or cluster isolation.

## Phase 7 NGINX pilot

The pilot workspace is available from My learning on enabled deployments. The learner edits a single NGINX directive, applies it to the running instance, and requests a preview of its fixed root path. The two allowed destinations are loopback upstreams inside that instance. The gateway uses one-use HTTP grants for configuration and preview. This workspace exposes the configuration editor and text preview in the browser.

The bridge claims durable jobs with a 45-second lease. The controller creates a deterministic instance name from its deployment namespace and opaque attempt ID, using an operator-approved image ID. The sandbox has no published ports and uses Docker's `none` driver, which gives it a separate network namespace with loopback only. NGINX exposes the front proxy and both upstream listeners on loopback. The worker's checker reads the configuration and makes a fresh request to the front proxy. [Docker none network driver](https://docs.docker.com/engine/network/drivers/none/)

Each sandbox receives 0.25 CPU, 48 MiB of memory including swap accounting, a 24-PID limit, and two bounded 1 MiB tmpfs mounts. It runs as UID/GID 101 with a read-only root, all Linux capabilities dropped, and `no-new-privileges`. The LMS database and controller management network are outside the sandbox namespace.

One learner can hold one active instance, and one deployment can hold four. Six start requests per learner per hour can create instances. The attempt expires 15 minutes after launch. Stop, reset, session revocation, and expiry queue destruction. Reset removes the old workspace before a subsequent start. The bridge retries cleanup and reconciles the controller inventory. The sandbox exits at its deadline and Docker removes it automatically. The controller also sweeps expired container labels while the bridge is offline. Cleanup failures produce service logs with the opaque attempt ID. See the [operator setup](README.md#enable-the-nginx-real-lab-pilot).

## Phase 12 multi-track workspaces

| Template | Track | Learner input | Trusted checker |
| --- | --- | --- | --- |
| `nginx-reverse-proxy@1` | Web Proxy | One allowed `proxy_pass` directive | `nginx-route@1` reads the directive and a fresh response from the loopback proxy. |
| `linux-file-permissions@1` | Linux and OS | One allowed `umask` command | `linux-umask@1` reads the stored mask and checks the mode and owner of a file created in the sandbox with that mask. |
| `prometheus-exposition@1` | Observability | One staging or production setting | `prometheus-exposition@1` reads the configured environment and checks the exact Prometheus counter exposition from the live loopback `/metrics` endpoint. |

The versioned catalog is shared by the application and worker images. The unqualified Real Lab URL and launch API select NGINX. A template-specific URL selects the corresponding exercise, and an active workspace remains visible until it is stopped, reset, or expires. The browser displays config and output as LTR text in either locale.

The controller starts all three templates from one operator-approved sandbox image. It uses the template label with the existing attempt and expiry labels. The Linux exercise runs a fixed script that creates a file and then keeps the workspace alive until expiry. The metrics exercise serves a fixed counter from NGINX within the attempt's loopback namespace. Both use the original resource limits and lifecycle, including auto-removal when the bridge and controller are offline. The shared start quotas and concurrency caps count every template.

For upgrades, apply migration `0013`, build the approved sandbox image for the target revision, and update the controller and bridge before enabling new starts in the updated web app. For a remote worker, build and deploy these images inside its existing trust zone. [Operator setup](README.md#enable-the-nginx-real-lab-pilot) · [Phase 12 acceptance](ACCEPTANCE_TESTS.md#phase-12-multi-track-real-labs)
