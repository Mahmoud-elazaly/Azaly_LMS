#!/usr/bin/env bash
set -euo pipefail
export PHASE9_TEST=1
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/verify-phase8.sh"
