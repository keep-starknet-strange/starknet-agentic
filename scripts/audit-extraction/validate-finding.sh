#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <finding.json>" >&2
  exit 1
fi

FILE="$1"

if [ ! -r "$FILE" ]; then
  echo "Unreadable file: $FILE" >&2
  exit 1
fi

jq -e 'type == "object"' "$FILE" >/dev/null 2>&1 || {
  echo "Invalid JSON object: $FILE" >&2
  exit 1
}

required=(
  finding_id
  source_audit_id
  project
  auditor
  date
  severity_original
  severity_normalized
  status
  contracts
  functions
  root_cause
  exploit_path
  trigger_condition
  vulnerable_snippet
  recommendation
  false_positive_lookalikes
  tags
  source_pages
  confidence
  evidence_strength
  reproducibility
  notes
)

for key in "${required[@]}"; do
  jq -e --arg k "$key" '
    has($k)
    and .[$k] != null
    and ((.[$k] | type) != "string" or (.[$k] | length) > 0)
    and ((.[$k] | type) != "array" or (.[$k] | length) > 0)
  ' "$FILE" >/dev/null || {
    echo "Missing required field: $key" >&2
    exit 1
  }
done

optional_nullable_string=(
  fixed_snippet
  test_that_catches_it
)

for key in "${optional_nullable_string[@]}"; do
  jq -e --arg k "$key" '
    if has($k) and .[$k] != null then
      ((.[$k] | type) == "string") and ((.[$k] | length) > 0)
    else
      true
    end
  ' "$FILE" >/dev/null || {
    echo "Invalid optional field: $key (must be null or non-empty string)" >&2
    exit 1
  }
done

echo "OK: $FILE"
