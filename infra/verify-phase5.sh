#!/usr/bin/env bash
set -euo pipefail
export PHASE5_TEST=1
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/verify-phase4.sh"
