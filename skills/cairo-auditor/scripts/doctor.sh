#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${CAIRO_AUDITOR_WORKDIR:-/tmp}"
REPORT_DIR="."
REPORT_PATH=""

usage() {
  cat <<'EOF'
Usage: bash skills/cairo-auditor/scripts/doctor.sh [--workdir PATH] [--report-dir PATH] [--report PATH]

Checks:
  - host-capabilities artifact exists
  - bundle artifacts 1..4 exist with non-zero lines
  - latest security-review report exists
  - report includes Execution Integrity + Execution Trace markers
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workdir)
      if [[ $# -lt 2 ]]; then
        echo "--workdir requires a path" >&2
        usage
        exit 2
      fi
      WORKDIR="$2"
      shift 2
      ;;
    --report-dir)
      if [[ $# -lt 2 ]]; then
        echo "--report-dir requires a path" >&2
        usage
        exit 2
      fi
      REPORT_DIR="$2"
      shift 2
      ;;
    --report)
      if [[ $# -lt 2 ]]; then
        echo "--report requires a path" >&2
        usage
        exit 2
      fi
      REPORT_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

fail_count=0

say_ok() {
  echo "[OK] $1"
}

say_fail() {
  echo "[FAIL] $1"
  fail_count=$((fail_count + 1))
}

resolve_artifact_root() {
  local preferred="$1"
  if [[ -f "$preferred/cairo-audit-host-capabilities.json" ]]; then
    echo "$preferred"
    return
  fi
  if [[ -f "/tmp/cairo-audit-host-capabilities.json" ]]; then
    echo "/tmp"
    return
  fi
  echo "$preferred"
}

ART_ROOT="$(resolve_artifact_root "$WORKDIR")"

if [[ -f "$ART_ROOT/cairo-audit-host-capabilities.json" ]]; then
  say_ok "Host capabilities file: $ART_ROOT/cairo-audit-host-capabilities.json"
else
  say_fail "Missing host capabilities file: $ART_ROOT/cairo-audit-host-capabilities.json"
fi

for i in 1 2 3 4; do
  bundle="$ART_ROOT/cairo-audit-agent-$i-bundle.md"
  if [[ ! -f "$bundle" ]]; then
    say_fail "Missing bundle: $bundle"
    continue
  fi
  lines="$(wc -l < "$bundle" | tr -d ' ')"
  if [[ "${lines:-0}" -gt 0 ]]; then
    say_ok "Bundle $i lines: $lines"
  else
    say_fail "Bundle $i is empty: $bundle"
  fi
done

if [[ -z "$REPORT_PATH" ]]; then
  REPORT_PATH="$(ls -t "$REPORT_DIR"/security-review-*.md 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$REPORT_PATH" || ! -f "$REPORT_PATH" ]]; then
  say_fail "No security-review-*.md report found (report-dir: $REPORT_DIR)"
else
  say_ok "Report file: $REPORT_PATH"
  if grep -q '^`Execution Integrity: ' "$REPORT_PATH" || grep -q '^Execution Integrity: ' "$REPORT_PATH"; then
    say_ok "Execution Integrity marker present"
  else
    say_fail "Missing Execution Integrity marker in report"
  fi
  if grep -q '^## Execution Trace' "$REPORT_PATH"; then
    say_ok "Execution Trace section present"
  else
    say_fail "Missing Execution Trace section in report"
  fi
fi

if [[ "$fail_count" -gt 0 ]]; then
  echo
  echo "Doctor status: FAILED ($fail_count issue(s))"
  exit 1
fi

echo
echo "Doctor status: PASS"
