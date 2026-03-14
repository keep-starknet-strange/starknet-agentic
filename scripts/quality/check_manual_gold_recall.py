#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True)
class GoldRow:
    finding_id: str
    repo: str
    ref: str
    file: str
    class_id: str
    expected_detect: bool

    @property
    def key(self) -> tuple[str, str, str, str]:
        return (self.repo, self.ref, self.file, self.class_id)


def load_gold(path: Path) -> list[GoldRow]:
    rows: list[GoldRow] = []
    seen_ids: set[str] = set()
    seen_keys: set[tuple[str, str, str, str]] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        required = {"finding_id", "repo", "ref", "file", "class_id", "expected_detect"}
        missing = sorted(required - set(raw.keys()))
        if missing:
            raise ValueError(f"{path}:{line_no}: missing keys: {missing}")
        expected_detect = raw["expected_detect"]
        if not isinstance(expected_detect, bool):
            raise ValueError(f"{path}:{line_no}: expected_detect must be boolean")
        finding_id = str(raw["finding_id"])
        if finding_id in seen_ids:
            raise ValueError(f"{path}:{line_no}: duplicate finding_id: {finding_id}")
        seen_ids.add(finding_id)
        row = GoldRow(
            finding_id=finding_id,
            repo=str(raw["repo"]),
            ref=str(raw["ref"]),
            file=str(raw["file"]),
            class_id=str(raw["class_id"]),
            expected_detect=expected_detect,
        )
        if row.key in seen_keys:
            raise ValueError(f"{path}:{line_no}: duplicate gold match key: {row.key}")
        seen_keys.add(row.key)
        rows.append(row)
    return rows


def load_findings(path: Path) -> set[tuple[str, str, str, str]]:
    keys: set[tuple[str, str, str, str]] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        required = {"repo", "ref", "file", "class_id"}
        missing = sorted(required - set(raw.keys()))
        if missing:
            raise ValueError(f"{path}:{line_no}: missing keys: {missing}")
        if "predicted_detect" in raw:
            predicted_detect = raw["predicted_detect"]
            if not isinstance(predicted_detect, bool):
                raise ValueError(f"{path}:{line_no}: predicted_detect must be boolean")
            if not predicted_detect:
                continue
        keys.add((str(raw["repo"]), str(raw["ref"]), str(raw["file"]), str(raw["class_id"])))
    return keys


def recall(matched: int, total: int) -> float:
    return 1.0 if total == 0 else matched / total


def precision(tp: int, fp: int) -> float:
    return 1.0 if (tp + fp) == 0 else tp / (tp + fp)


def render_markdown(
    *,
    generated_at: str,
    gold_path: Path,
    findings_path: Path,
    positive_rows: list[GoldRow],
    negative_rows: list[GoldRow],
    matched_rows: list[GoldRow],
    missing_rows: list[GoldRow],
    false_positive_rows: list[GoldRow],
) -> str:
    total = len(positive_rows)
    matched = len(matched_rows)
    missing = len(missing_rows)
    overall_recall = recall(matched, total)
    overall_precision = None if len(negative_rows) == 0 else precision(matched, len(false_positive_rows))

    per_class_total: dict[str, int] = defaultdict(int)
    per_class_matched: dict[str, int] = defaultdict(int)
    for row in positive_rows:
        per_class_total[row.class_id] += 1
    for row in matched_rows:
        per_class_matched[row.class_id] += 1

    lines: list[str] = []
    lines.append("# Manual-19 Gold Recall")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Gold set: `{gold_path.as_posix()}`")
    lines.append(f"Findings: `{findings_path.as_posix()}`")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Gold positives: {total}")
    lines.append(f"- Gold negatives: {len(negative_rows)}")
    lines.append(f"- Matched: {matched}")
    lines.append(f"- Missing: {missing}")
    lines.append(f"- False positives (gold negatives hit): {len(false_positive_rows)}")
    if overall_precision is None:
        lines.append("- Precision (gold-scope): N/A (no gold negatives)")
    else:
        lines.append(f"- Precision (gold-scope): {overall_precision:.3f}")
    lines.append(f"- Recall: {overall_recall:.3f}")
    lines.append("")
    lines.append("## Per Class Recall")
    lines.append("")
    lines.append("| Class | Matched | Total | Recall |")
    lines.append("| --- | ---: | ---: | ---: |")
    for class_id in sorted(per_class_total):
        c_total = per_class_total[class_id]
        c_matched = per_class_matched.get(class_id, 0)
        lines.append(f"| {class_id} | {c_matched} | {c_total} | {recall(c_matched, c_total):.3f} |")
    lines.append("")
    if missing_rows:
        lines.append("## Missing Gold Findings")
        lines.append("")
        lines.append("| Finding | Class | Repo | File | Ref |")
        lines.append("| --- | --- | --- | --- | --- |")
        for row in sorted(missing_rows, key=lambda r: r.finding_id):
            lines.append(
                f"| {row.finding_id} | {row.class_id} | `{row.repo}` | `{row.file}` | `{row.ref[:12]}` |"
            )
        lines.append("")
    if false_positive_rows:
        lines.append("## False Positives Against Gold Negatives")
        lines.append("")
        lines.append("| Finding | Class | Repo | File | Ref |")
        lines.append("| --- | --- | --- | --- | --- |")
        for row in sorted(false_positive_rows, key=lambda r: r.finding_id):
            lines.append(
                f"| {row.finding_id} | {row.class_id} | `{row.repo}` | `{row.file}` | `{row.ref[:12]}` |"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check recall against manual-19 gold positives.")
    parser.add_argument("--gold", required=True, help="Gold positives JSONL")
    parser.add_argument("--findings", required=True, help="Findings JSONL (detector output)")
    parser.add_argument("--output-md", required=True, help="Markdown output")
    parser.add_argument("--output-json", required=True, help="JSON output")
    parser.add_argument("--min-precision", type=float, default=0.0)
    parser.add_argument("--min-recall", type=float, default=0.9)
    parser.add_argument("--min-class-recall", type=float, default=0.8)
    args = parser.parse_args()

    gold_path = Path(args.gold)
    findings_path = Path(args.findings)
    out_md = Path(args.output_md)
    out_json = Path(args.output_json)

    gold_rows = load_gold(gold_path)
    if not gold_rows:
        raise ValueError(f"{gold_path}: gold set is empty")
    finding_keys = load_findings(findings_path)
    positive_rows = [row for row in gold_rows if row.expected_detect]
    negative_rows = [row for row in gold_rows if not row.expected_detect]
    if not positive_rows:
        raise ValueError(f"{gold_path}: no expected_detect=true rows; recall cannot be measured")
    if args.min_precision > 0 and not negative_rows:
        raise ValueError("--min-precision requires at least one expected_detect=false gold row")
    matched_rows = [row for row in positive_rows if row.key in finding_keys]
    missing_rows = [row for row in positive_rows if row.key not in finding_keys]
    false_positive_rows = [row for row in negative_rows if row.key in finding_keys]

    per_class_total: dict[str, int] = defaultdict(int)
    per_class_matched: dict[str, int] = defaultdict(int)
    for row in positive_rows:
        per_class_total[row.class_id] += 1
    for row in matched_rows:
        per_class_matched[row.class_id] += 1

    overall_recall = recall(len(matched_rows), len(positive_rows))
    has_negative_gold = len(negative_rows) > 0
    overall_precision = precision(len(matched_rows), len(false_positive_rows)) if has_negative_gold else None
    class_violations: list[tuple[str, float]] = []
    for class_id, total in sorted(per_class_total.items()):
        class_recall = recall(per_class_matched.get(class_id, 0), total)
        if class_recall < args.min_class_recall:
            class_violations.append((class_id, class_recall))

    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    markdown = render_markdown(
        generated_at=generated_at,
        gold_path=gold_path,
        findings_path=findings_path,
        positive_rows=positive_rows,
        negative_rows=negative_rows,
        matched_rows=matched_rows,
        missing_rows=missing_rows,
        false_positive_rows=false_positive_rows,
    )
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(markdown + "\n", encoding="utf-8")

    summary = {
        "generated_at": generated_at,
        "gold_count": len(gold_rows),
        "gold_positive_count": len(positive_rows),
        "gold_negative_count": len(negative_rows),
        "matched_count": len(matched_rows),
        "missing_count": len(missing_rows),
        "false_positive_count": len(false_positive_rows),
        "overall_precision": overall_precision,
        "overall_recall": overall_recall,
        "min_precision": args.min_precision if has_negative_gold else None,
        "min_recall": args.min_recall,
        "min_class_recall": args.min_class_recall,
        "class_recall": {
            class_id: recall(per_class_matched.get(class_id, 0), total)
            for class_id, total in sorted(per_class_total.items())
        },
        "class_violations": [{"class_id": c, "recall": v} for c, v in class_violations],
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(summary, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "gold": len(gold_rows),
                "matched": len(matched_rows),
                "false_positive_count": len(false_positive_rows),
                "overall_precision": round(overall_precision, 6) if overall_precision is not None else None,
                "overall_recall": round(overall_recall, 6),
                "output_md": out_md.as_posix(),
                "output_json": out_json.as_posix(),
            },
            ensure_ascii=True,
        )
    )

    if overall_precision is not None and overall_precision < args.min_precision:
        print(
            f"FAILED: manual gold precision={overall_precision:.3f} < min_precision={args.min_precision:.3f}"
        )
        return 1
    if overall_recall < args.min_recall:
        print(
            f"FAILED: manual gold recall={overall_recall:.3f} < min_recall={args.min_recall:.3f}"
        )
        return 1
    if class_violations:
        detail = ", ".join(f"{class_id}={value:.3f}" for class_id, value in class_violations)
        print(
            f"FAILED: class recall below min_class_recall={args.min_class_recall:.3f}: {detail}"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
