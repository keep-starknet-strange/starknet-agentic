#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

NUMERIC_HEADING = re.compile(r"^\s*(\d+(?:\.\d+)+)\s+(.+?)\s*$")
ID_HEADING = re.compile(r"^\s*([A-Z]{1,3}-\d{2,})\s+(.+?)\s*$")
DETAIL_MARKERS = (
    "File(s):",
    "File:",
    "Contract:",
    "Location:",
    "Affected",
    "Description:",
    "Recommendation:",
    "Impact:",
)
# Keep watermark stripping scoped to known noisy report styles only.
AUDIT_WATERMARK_TOKENS = {
    "erim_nostra_pools_2024_01": {"V.", "Er", "im", "Rev", "ev", "ie", "iew"},
}


@dataclass
class Seg:
    heading_key: str
    heading_title: str
    start_page: int
    lines: list[str]


def detect_heading(line: str) -> tuple[str, str] | None:
    m = ID_HEADING.match(line)
    if m:
        if "..." in line or ". . ." in line:
            return None
        return (m.group(1), m.group(2).strip())
    m = NUMERIC_HEADING.match(line)
    if m:
        if "..." in line or ". . ." in line or re.search(r"\.\s+\d+\s*$", line):
            return None
        return (m.group(1), m.group(2).strip())
    return None


def segment_text(text: str) -> list[dict]:
    pages = text.split("\f")
    segments: list[dict] = []
    current: Seg | None = None
    current_page = 1

    for page_idx, page in enumerate(pages, start=1):
        current_page = page_idx
        for raw in page.splitlines():
            line = raw.rstrip()
            heading = detect_heading(line)
            if heading:
                if current and current.lines:
                    segments.append(
                        {
                            "heading_key": current.heading_key,
                            "heading_title": current.heading_title,
                            "start_page": current.start_page,
                            "end_page": current_page,
                            "content": "\n".join(current.lines).strip(),
                        }
                    )
                current = Seg(heading_key=heading[0], heading_title=heading[1], start_page=page_idx, lines=[line])
            elif current is not None:
                current.lines.append(line)

    if current and current.lines:
        segments.append(
            {
                "heading_key": current.heading_key,
                "heading_title": current.heading_title,
                "start_page": current.start_page,
                "end_page": current_page,
                "content": "\n".join(current.lines).strip(),
            }
        )

    return segments


def seg_type(heading_key: str) -> str:
    if ID_HEADING.match(f"{heading_key} x"):
        return "finding"
    if re.match(r"^\d+\.\d+\.\d+$", heading_key):
        return "finding_candidate"
    return "section"


def is_toc_noise(seg: dict) -> bool:
    title = seg["heading_title"]
    content = seg["content"]
    dotted_title = ("..." in title) or (". . ." in title)
    short_content = len(content.splitlines()) <= 2
    early_page = seg["start_page"] <= 3
    has_detail_markers = any(
        marker in content for marker in ("File(s):", "Description:", "Recommendation", "Status:")
    )
    return dotted_title and short_content and early_page and not has_detail_markers


def is_low_signal(seg: dict) -> bool:
    title = seg["heading_title"].lower()
    if "tests output" in title or "compilation output" in title:
        return True
    if ID_HEADING.match(f"{seg['heading_key']} x"):
        has_detail = any(marker in seg["content"] for marker in DETAIL_MARKERS)
        if not has_detail and seg["start_page"] <= 5:
            return True
    return False


def load_blocked_audit_ids(repo_root: Path) -> set[str]:
    blocklist = repo_root / "evals" / "heldout" / "audit_ids.txt"
    if not blocklist.exists():
        return set()
    blocked = set()
    for raw in blocklist.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        blocked.add(line)
    return blocked


def clean_layout_noise(content: str, audit_id: str) -> str:
    watermark_tokens = AUDIT_WATERMARK_TOKENS.get(audit_id, set())
    cleaned_lines: list[str] = []
    for raw in content.splitlines():
        line = raw.strip()
        if line in watermark_tokens:
            continue
        cleaned_lines.append(raw.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(cleaned_lines)).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Segment extracted audit text by headings")
    parser.add_argument("--audit-id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    repo_root = Path(__file__).resolve().parents[2]
    blocked_audit_ids = load_blocked_audit_ids(repo_root)
    if args.audit_id in blocked_audit_ids:
        raise ValueError(f"audit_id is blocked by held-out policy: {args.audit_id}")

    segments = segment_text(in_path.read_text(encoding="utf-8", errors="replace"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        idx = 0
        for seg in segments:
            if is_toc_noise(seg):
                continue
            if is_low_signal(seg):
                continue
            seg["content"] = clean_layout_noise(seg["content"], args.audit_id)
            if not seg["content"]:
                continue
            idx += 1
            seg["segment_id"] = f"{args.audit_id}:{idx:04d}"
            seg["audit_id"] = args.audit_id
            seg["segment_type"] = seg_type(seg["heading_key"])
            f.write(json.dumps(seg, ensure_ascii=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
