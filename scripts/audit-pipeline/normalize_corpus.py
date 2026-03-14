#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import Counter
from pathlib import Path

MONTHS = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "feb": 2,
    "march": 3,
    "mar": 3,
    "april": 4,
    "apr": 4,
    "may": 5,
    "june": 6,
    "jun": 6,
    "july": 7,
    "jul": 7,
    "august": 8,
    "aug": 8,
    "september": 9,
    "sep": 9,
    "sept": 9,
    "october": 10,
    "oct": 10,
    "november": 11,
    "nov": 11,
    "december": 12,
    "dec": 12,
}

SEVERITY_RE = r"Critical|High|Medium|Low|Informational|Info|Best Practices?|Best Practice|Lowest"
STATUS_RE = r"Fixed|Mitigated|Acknowledged|Unresolved|Resolved|Verified|Partially\s+Fixed|Open|Pending|N/?A"

PATTERNS = [
    re.compile(
        rf"^\s*(?:\d+|[A-Z]{{1,4}}-\d{{1,3}}|#\d{{1,3}}|\d+\.\d+)\s+"
        rf"(?P<title>.+?)\s+(?P<severity>{SEVERITY_RE})(?:\s+(?P<status>{STATUS_RE}))?\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        rf"^\s*\d+(?:\.\d+)?\s+\[(?P<severity>{SEVERITY_RE})\]\s+(?P<title>.+?)\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"^\s*Issue\s+(?P<code>[HMLI]-\d+)\s*:\s*(?P<title>.+?)\s*$", re.IGNORECASE),
    re.compile(
        rf"^\s*(?P<code>[CHMLI]-\d+|BP\d+|BP-\d+)\s+(?P<title>.+?)\.{2,}\s*(?P<page>\d{{1,3}})\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^\s*(?P<code>[CHMLI]-\d+)\s+(?P<title>.+?)\s+"
        r"(?P<status>Resolved|Verified|Acknowledged|Mitigated|Unresolved|Fixed)\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"^\s*\[(?P<code>[CHMLI]-\d+)\]\s+(?P<title>.+?)\s*$", re.IGNORECASE),
    re.compile(r"^\s*(?P<code>[HMLN]-\d{2})\s+(?P<title>[A-Za-z].+?)\s*$", re.IGNORECASE),
]

BAD_TITLE_PREFIXES = (
    "distribution of issues",
    "risk classification",
    "severity definition",
    "technical summary",
    "findings summary",
    "issues found",
    "summary of issues",
    "table of contents",
)

KEYWORD_TAGS = {
    "dos": "dos",
    "denial": "dos",
    "reentr": "reentrancy",
    "overflow": "overflow",
    "underflow": "underflow",
    "signature": "signature",
    "replay": "replay",
    "upgrade": "upgrade",
    "timelock": "timelock",
    "access": "access-control",
    "permission": "access-control",
    "owner": "ownership",
    "oracle": "oracle",
    "slippage": "slippage",
    "bridge": "bridge",
    "merkle": "merkle",
    "allowance": "allowance",
    "approval": "allowance",
    "withdraw": "withdrawal",
    "deposit": "deposit",
}


def load_manifest(path: Path) -> list[dict]:
    rows = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        rows.append(json.loads(raw))
    return rows


def normalize_date(row: dict, text: str) -> str:
    raw_date = row.get("date")
    if isinstance(raw_date, str) and raw_date.strip():
        raw = raw_date.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
            return raw
        if re.fullmatch(r"\d{4}-\d{2}", raw):
            return f"{raw}-01"
        if re.fullmatch(r"\d{4}", raw):
            return f"{raw}-01-01"

    month_pattern = re.compile(
        r"(" + "|".join(MONTHS.keys()) + r")\s+(\d{1,2})?,?\s*(20\d{2})",
        re.IGNORECASE,
    )
    for match in month_pattern.finditer(text[:4000]):
        month = MONTHS[match.group(1).lower()]
        day = int(match.group(2)) if match.group(2) else 1
        year = int(match.group(3))
        try:
            return dt.date(year, month, day).isoformat()
        except ValueError:
            continue

    id_match = re.search(r"(20\d{2})", str(row.get("audit_id", "")))
    if id_match:
        return f"{id_match.group(1)}-01-01"

    ingested = str(row.get("ingested_at", ""))
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", ingested):
        return ingested[:10]

    return "2026-01-01"


def normalize_severity(severity: str) -> str:
    s = severity.lower().strip()
    if s.startswith("best"):
        return "best_practice"
    if s in {"informational", "info"}:
        return "info"
    if s == "lowest":
        return "low"
    return s


def normalize_status(status: str | None) -> str:
    if not status:
        return "reported"
    s = status.lower().strip()
    mapping = {
        "n/a": "reported",
        "open": "unresolved",
        "pending": "unresolved",
        "partially fixed": "mitigated",
    }
    return mapping.get(s, s.replace(" ", "_"))


def clean_title(title: str) -> str:
    t = title.replace("\u000c", " ")
    t = re.sub(r"\s*\.{2,}\s*\d{1,3}\s*$", "", t)
    t = re.sub(r"\s*\.{2,}\s*", " ", t)
    t = re.sub(r"\s+\d{1,3}\s*$", "", t)
    t = t.replace("/:", "::")
    t = re.sub(r"\s{2,}", " ", t)
    t = t.strip(" -:\t")
    return t


def parse_scope_files(text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z0-9_./\-]+\.cairo", text)
    out = []
    seen = set()
    for item in candidates:
        cleaned = item.strip(".,:;()[]{}")
        if cleaned in seen:
            continue
        seen.add(cleaned)
        out.append(cleaned)
        if len(out) >= 40:
            break
    if out:
        return out
    return ["unspecified.cairo"]


def infer_tags(title: str, severity: str) -> list[str]:
    low = title.lower()
    tags = ["audit-import", severity]
    for key, value in KEYWORD_TAGS.items():
        if key in low and value not in tags:
            tags.append(value)
    return tags


def infer_contracts(line: str, title: str) -> list[str]:
    merged = f"{line} {title}"
    paths = re.findall(r"[A-Za-z0-9_./\-]+\.cairo", merged)
    if not paths:
        return ["unspecified.cairo"]
    uniq = []
    seen = set()
    for path in paths:
        p = path.strip(".,:;()[]{}")
        if p in seen:
            continue
        seen.add(p)
        uniq.append(p)
    return uniq[:5]


def infer_functions(line: str, title: str) -> list[str]:
    merged = f"{line} {title}"
    funcs = []
    seen = set()
    for match in re.finditer(r"function\s+([A-Za-z_][A-Za-z0-9_]*)", merged, re.IGNORECASE):
        fn = match.group(1)
        if fn not in seen:
            seen.add(fn)
            funcs.append(fn)
    for match in re.finditer(r"([A-Za-z_][A-Za-z0-9_]*)\(\.\.\.\)", merged):
        fn = match.group(1)
        if fn not in seen:
            seen.add(fn)
            funcs.append(fn)
    if funcs:
        return funcs[:5]
    return ["unspecified"]


def parse_findings(audit_id: str, project: str, auditor: str, date: str, text: str) -> list[dict]:
    findings: list[dict] = []
    dedupe: set[tuple[str, str]] = set()
    lines = text.splitlines()
    code_status_re = re.compile(
        r"^\s*(?P<label>(Critical|High|Medium|Low|Lowest|Info(?:rmational)?|Best Practices?)-\d+)\s+"
        r"(?P<status>Resolved|Verified|Acknowledged|Mitigated|Unresolved|Fixed)\s*$",
        re.IGNORECASE,
    )
    detail_header_re = re.compile(
        r"(?:Detailed Findings\s+)?(?P<section>\d+\.\d+)\.\s+(?P<title>[A-Za-z].+)$",
        re.IGNORECASE,
    )
    severity_inline_re = re.compile(
        r"Severity\s+(Critical|High|Medium|Low|Informational|Info|Best Practices?)",
        re.IGNORECASE,
    )
    status_inline_re = re.compile(
        r"Status\s+(Resolved|Verified|Acknowledged|Mitigated|Unresolved|Fixed)",
        re.IGNORECASE,
    )

    for idx, line in enumerate(lines):
        candidate = line.strip()
        if not candidate or len(candidate) < 8:
            continue

        parsed = None
        page = 1

        code_status = code_status_re.match(candidate)
        if code_status:
            raw_label = code_status.group("label")
            code_sev = raw_label.split("-", maxsplit=1)[0]
            next_title = ""
            for offset in range(1, 6):
                if idx + offset >= len(lines):
                    break
                probe = clean_title(lines[idx + offset].strip())
                if not probe:
                    continue
                if probe.lower().startswith(("recommendation", "post-audit", "target", "description")):
                    continue
                next_title = probe
                break
            if next_title:
                parsed = (next_title, code_sev, code_status.group("status"))

        if not parsed:
            detail_header = detail_header_re.search(candidate)
            if detail_header:
                detail_title = clean_title(detail_header.group("title"))
                sev_guess = None
                stat_guess = None
                for offset in range(1, 15):
                    if idx + offset >= len(lines):
                        break
                    nearby = lines[idx + offset]
                    sev_match = severity_inline_re.search(nearby)
                    if sev_match and not sev_guess:
                        sev_guess = sev_match.group(1)
                    stat_match = status_inline_re.search(nearby)
                    if stat_match and not stat_guess:
                        stat_guess = stat_match.group(1)
                    if sev_guess and stat_guess:
                        break
                if detail_title and sev_guess:
                    parsed = (detail_title, sev_guess, stat_guess)

        if not parsed:
            for pattern in PATTERNS:
                m = pattern.match(candidate)
                if not m:
                    continue

                gd = m.groupdict()
                title = gd.get("title") or ""
                severity = gd.get("severity")
                status = gd.get("status")
                code = gd.get("code")
                if code and not severity:
                    sev_map = {
                        "H": "high",
                        "M": "medium",
                        "L": "low",
                        "I": "info",
                        "N": "info",
                        "C": "critical",
                        "B": "best_practice",
                    }
                    severity = sev_map.get(code[0].upper(), "info")
                if gd.get("page"):
                    page = int(gd["page"])

                parsed = (title, severity or "info", status)
                break

        if not parsed:
            continue

        title_raw, severity_raw, status_raw = parsed
        title = clean_title(title_raw)
        if not title:
            continue
        low_title = title.lower()
        if any(low_title.startswith(prefix) for prefix in BAD_TITLE_PREFIXES):
            continue
        if low_title in {"high", "medium", "low", "critical", "informational", "info"}:
            continue
        if len(title) < 12:
            continue
        if low_title.endswith((" due to", " during pool", " during", " for", " and")):
            continue

        severity = normalize_severity(severity_raw)
        if severity not in {"critical", "high", "medium", "low", "info", "best_practice"}:
            continue

        canonical_tokens = re.findall(r"[a-z0-9]+", low_title)
        if len(canonical_tokens) < 3:
            continue
        dedupe_key = (" ".join(canonical_tokens[:10]), severity)
        if dedupe_key in dedupe:
            continue
        dedupe.add(dedupe_key)

        status = normalize_status(status_raw)
        index = len(findings) + 1
        finding_id = f"{audit_id.upper()}-{index:03d}"
        contracts = infer_contracts(candidate, title)
        functions = infer_functions(candidate, title)
        tags = infer_tags(title, severity)

        finding = {
            "finding_id": finding_id,
            "source_audit_id": audit_id,
            "project": project,
            "auditor": auditor,
            "date": date,
            "severity_original": severity_raw,
            "severity_normalized": severity,
            "status": status,
            "contracts": contracts,
            "functions": functions,
            "root_cause": f"Audit report flags '{title}' as a security or correctness issue.",
            "exploit_path": f"If unmitigated, '{title}' can be triggered in production contract flows.",
            "trigger_condition": f"The issue manifests when execution reaches the path described in '{title}'.",
            "vulnerable_snippet": f"See source audit finding: {title}",
            "fixed_snippet": None,
            "recommendation": "Apply the audit's remediation and add a regression test before release.",
            "test_that_catches_it": f"Regression test covering '{title}'.",
            "false_positive_lookalikes": [
                "Cases where equivalent behavior is guarded by explicit invariants and access controls."
            ],
            "tags": tags,
            "source_pages": [max(1, page)],
            "confidence": "medium",
            "evidence_strength": "moderate",
            "reproducibility": "confirmed_by_report",
            "notes": "Auto-normalized from extracted audit text. Manual reviewer pass recommended.",
        }
        findings.append(finding)

    return findings


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(json.dumps(record, ensure_ascii=True) for record in records)
    path.write_text((body + "\n") if body else "", encoding="utf-8")


def build_audit_metadata(row: dict, date: str, findings: list[dict], scope_files: list[str]) -> dict:
    severity_counts = Counter(f["severity_normalized"] for f in findings)
    status_counts = Counter(f["status"] for f in findings)
    return {
        "audit_id": row["audit_id"],
        "project": row["project"],
        "auditor": row["auditor"],
        "date": date,
        "source_url": row["source_url"],
        "repository": row.get("repo_url") or "unknown",
        "scope_files": scope_files,
        "finding_count": len(findings),
        "severity_counts": dict(sorted(severity_counts.items())),
        "status_summary": dict(sorted(status_counts.items())),
        "notes": "Auto-normalized from ingest manifest and extracted report text.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize ingested audit corpus into metadata and finding records.")
    parser.add_argument("--manifest", default="datasets/manifests/audits.jsonl")
    parser.add_argument("--audits-dir", default="datasets/normalized/audits")
    parser.add_argument("--findings-dir", default="datasets/normalized/findings")
    parser.add_argument("--limit", type=int, default=0, help="Optional limit for number of audits to normalize.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing normalized files.")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    audits_dir = Path(args.audits_dir)
    findings_dir = Path(args.findings_dir)

    rows = load_manifest(manifest_path)
    processed = 0

    for row in rows:
        if args.limit and processed >= args.limit:
            break
        audit_id = row["audit_id"]

        audit_out = audits_dir / f"{audit_id}.json"
        findings_out = findings_dir / f"{audit_id}.findings.jsonl"

        if not args.overwrite and audit_out.exists() and findings_out.exists():
            continue

        extracted_path = Path(row["extracted_path"])
        if not extracted_path.exists():
            continue

        text = extracted_path.read_text(encoding="utf-8", errors="ignore")
        date = normalize_date(row, text)
        scope_files = parse_scope_files(text)
        findings = parse_findings(audit_id, row["project"], row["auditor"], date, text)

        audit_meta = build_audit_metadata(row, date, findings, scope_files)
        write_json(audit_out, audit_meta)
        write_jsonl(findings_out, findings)
        processed += 1

    print(json.dumps({"processed": processed, "manifest_rows": len(rows)}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
