#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW_DIR="${ROOT_DIR}/datasets/audits/raw"
EXTRACTED_DIR="${ROOT_DIR}/datasets/audits/extracted"

usage() {
  cat <<'EOF'
Usage:
  scripts/audit-extraction/fetch-and-extract.sh <urls_file>

Input file format:
  - One PDF URL per line.
  - Empty lines and lines starting with # are ignored.

Behavior:
  - Downloads each PDF into datasets/audits/raw/
  - Extracts plain text into datasets/audits/extracted/
  - Uses pdftotext first, then mutool fallback
EOF
}

normalize_url() {
  local url="$1"
  if [[ "$url" =~ ^https://github.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)$ ]]; then
    local owner="${BASH_REMATCH[1]}"
    local repo="${BASH_REMATCH[2]}"
    local ref="${BASH_REMATCH[3]}"
    local path="${BASH_REMATCH[4]}"
    url="$(printf "https://raw.githubusercontent.com/%s/%s/%s/%s" "$owner" "$repo" "$ref" "$path")"
    printf "%s" "${url// /%20}"
    return
  fi
  printf "%s" "${url// /%20}"
}

short_hash() {
  local value="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf "%s" "$value" | sha256sum | cut -c1-8
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    printf "%s" "$value" | shasum -a 256 | cut -c1-8
    return
  fi
  echo "ERROR: sha256sum/shasum is required for collision-safe filenames." >&2
  exit 1
}

extract_text() {
  local pdf_path="$1"
  local txt_path="$2"

  if command -v pdftotext >/dev/null 2>&1; then
    if pdftotext -layout "$pdf_path" "$txt_path"; then
      return 0
    fi
  fi

  if command -v mutool >/dev/null 2>&1; then
    if mutool draw -F txt -o "$txt_path" "$pdf_path" >/dev/null; then
      return 0
    fi
    return 1
  fi

  echo "ERROR: neither pdftotext nor mutool is available." >&2
  return 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

URLS_FILE="$1"
if [[ ! -f "$URLS_FILE" ]]; then
  echo "ERROR: urls file not found: $URLS_FILE" >&2
  exit 1
fi

mkdir -p "$RAW_DIR" "$EXTRACTED_DIR"

processed=0
failed=0

while IFS= read -r line || [[ -n "$line" ]]; do
  url="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ -z "$url" || "$url" =~ ^# ]]; then
    continue
  fi

  normalized_url="$(normalize_url "$url")"
  if [[ ! "$normalized_url" =~ ^https:// ]]; then
    echo "SKIP: non-HTTPS URL rejected: $normalized_url" >&2
    ((failed+=1))
    continue
  fi

  filename="$(basename "${normalized_url%%\?*}")"
  filename="${filename//%20/ }"
  filename="${filename// /_}"
  if [[ -z "$filename" || "$filename" == "/" ]]; then
    echo "SKIP: could not infer filename from URL: $url" >&2
    ((failed+=1))
    continue
  fi

  # Ensure extension for stable downstream naming.
  if [[ "$filename" != *.pdf ]]; then
    filename="${filename}.pdf"
  fi
  filename="$(short_hash "$normalized_url")_${filename}"

  pdf_path="${RAW_DIR}/${filename}"
  txt_path="${EXTRACTED_DIR}/${filename%.pdf}.txt"

  echo "Downloading: $normalized_url"
  if ! curl -fsSL --retry 3 --retry-all-errors -o "$pdf_path" "$normalized_url"; then
    echo "FAIL: download failed for $url" >&2
    rm -f "$pdf_path"
    ((failed+=1))
    continue
  fi

  # Enforce PDF magic header to avoid extracting HTML/error pages.
  if ! head -c 5 "$pdf_path" | grep -q '^%PDF-'; then
    echo "FAIL: downloaded content is not a PDF: $url" >&2
    rm -f "$pdf_path"
    ((failed+=1))
    continue
  fi

  echo "Extracting: $pdf_path -> $txt_path"
  if ! extract_text "$pdf_path" "$txt_path"; then
    echo "FAIL: extraction failed for $pdf_path" >&2
    rm -f "$txt_path"
    ((failed+=1))
    continue
  fi

  ((processed+=1))
done <"$URLS_FILE"

echo "Done. processed=${processed} failed=${failed}"
if [[ "$failed" -gt 0 ]]; then
  exit 2
fi
