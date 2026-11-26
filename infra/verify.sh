#!/usr/bin/env bash
set -euo pipefail
exec bash "$(dirname "$0")/verify-phase10.sh" "$@"
