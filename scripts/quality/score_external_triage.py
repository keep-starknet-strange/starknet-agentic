#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class LabelRow:
    finding_id: str
    release: str
    scan_id: str
    repo: str
    ref: str
    file: str
    class_id: str
    predicted_detect: bool
    human_outcome: str  # tp | fp
    confidence: str
    reviewer: str
    reviewed_at: str
    rationale: str

    @property
    def finding_key(self) -> tuple[str, str, str, str]:
        return (self.repo, self.ref, self.file, self.class_id)


@dataclass(frozen=True)
class FindingRow:
    repo: str
    ref: str
    file: str
    class_id: str
    scope: str

    @property
    def finding_key(self) -> tuple[str, str, str, str]:
        return (self.repo, self.ref, self.file, self.class_id)


def load_labels(path: Path) -> list[LabelRow]:
    rows: list[LabelRow] = []
    seen_ids: set[str] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        required = {
            "finding_id",
            "release",
            "scan_id",
            "repo",
            "ref",
            "file",
            "class_id",
            "predicted_detect",
            "human_outcome",
            "confidence",
            "reviewer",
            "reviewed_at",
            "rationale",
        }
        missing = sorted(required - set(raw.keys()))
        if missing:
            raise ValueError(f"{path}:{line_no}: missing keys: {missing}")
        finding_id = str(raw["finding_id"])
        if finding_id in seen_ids:
            raise ValueError(f"{path}:{line_no}: duplicate finding_id: {finding_id}")
        seen_ids.add(finding_id)
        human_outcome = str(raw["human_outcome"]).lower()
        if human_outcome not in {"tp", "fp"}:
            raise ValueError(f"{path}:{line_no}: human_outcome must be tp|fp")
        predicted_detect = bool(raw["predicted_detect"])
        rows.append(
            LabelRow(
                finding_id=finding_id,
                release=str(raw["release"]),
                scan_id=str(raw["scan_id"]),
                repo=str(raw["repo"]),
                ref=str(raw["ref"]),
                file=str(raw["file"]),
                class_id=str(raw["class_id"]),
                predicted_detect=predicted_detect,
                human_outcome=human_outcome,
                confidence=str(raw["confidence"]).lower(),
                reviewer=str(raw["reviewer"]),
                reviewed_at=str(raw["reviewed_at"]),
                rationale=str(raw["rationale"]),
            )
        )
    return rows


def load_findings(path: Path) -> list[FindingRow]:
    rows: list[FindingRow] = []
    seen: set[tuple[str, str, str, str]] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        required = {"repo", "ref", "file", "class_id"}
        missing = sorted(required - set(raw.keys()))
        if missing:
            raise ValueError(f"{path}:{line_no}: missing keys: {missing}")
        key = (
            str(raw["repo"]),
            str(raw["ref"]),
            str(raw["file"]),
            str(raw["class_id"]),
        )
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            FindingRow(
                repo=key[0],
                ref=key[1],
                file=key[2],
                class_id=key[3],
                scope=str(raw.get("scope", "prod_scan")),
            )
        )
    return rows


def infer_scan_id(findings_path: Path | None) -> str:
    if findings_path is None:
        return "unknown-scan"
    name = findings_path.name
    suffix = ".findings.jsonl"
    if name.endswith(suffix):
        return name[: -len(suffix)]
    return findings_path.stem


def precision(tp: int, fp: int) -> float:
    denom = tp + fp
    return 1.0 if denom == 0 else tp / denom


def recall(tp: int, fn: int) -> float:
    denom = tp + fn
    return 1.0 if denom == 0 else tp / denom


def score(rows: list[LabelRow]) -> dict[str, int]:
    totals = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    for row in rows:
        expected_detect = row.human_outcome == "tp"
        predicted = row.predicted_detect
        if predicted and expected_detect:
            totals["tp"] += 1
        elif predicted and not expected_detect:
            totals["fp"] += 1
        elif (not predicted) and expected_detect:
            totals["fn"] += 1
        else:
            totals["tn"] += 1
    return totals


def render_release_md(
    *,
    release: str,
    generated_at: str,
    label_path: Path,
    totals: dict[str, int],
    rows: list[LabelRow],
    findings_path: Path | None,
    labeled_in_scan: int | None,
    total_findings: int | None,
    unlabeled_rows: list[FindingRow],
) -> str:
    tp = totals["tp"]
    fp = totals["fp"]
    fn = totals["fn"]
    tn = totals["tn"]
    total = tp + fp + fn + tn
    p = precision(tp, fp)
    r = recall(tp, fn)
    acc = 1.0 if total == 0 else (tp + tn) / total

    lines: list[str] = []
    lines.append(f"# {release} Cairo Auditor External Triage")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Label file: `{label_path.as_posix()}`")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Findings labeled: {total}")
    lines.append(f"- Precision: {p:.3f}")
    lines.append(f"- Recall: {r:.3f}")
    lines.append(f"- Accuracy: {acc:.3f}")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("| --- | ---: |")
    lines.append(f"| TP | {tp} |")
    lines.append(f"| FP | {fp} |")
    lines.append(f"| FN | {fn} |")
    lines.append(f"| TN | {tn} |")
    lines.append("")
    if findings_path is not None and labeled_in_scan is not None and total_findings is not None:
        unlabeled = len(unlabeled_rows)
        coverage = 1.0 if total_findings == 0 else labeled_in_scan / total_findings
        lines.append("## Coverage")
        lines.append("")
        lines.append(f"- Findings source: `{findings_path.as_posix()}`")
        lines.append(f"- Distinct findings in scan: {total_findings}")
        lines.append(f"- Distinct findings labeled: {labeled_in_scan}")
        lines.append(f"- Unlabeled findings: {unlabeled}")
        lines.append(f"- Labeled coverage: {coverage:.3f}")
        lines.append("")
        lines.append("Precision/recall above are measured only on the labeled subset.")
        lines.append("")
        if unlabeled_rows:
            by_class = Counter(row.class_id for row in unlabeled_rows)
            lines.append("### Unlabeled Backlog (by class)")
            lines.append("")
            for class_id, count in sorted(by_class.items()):
                lines.append(f"- `{class_id}`: {count}")
            lines.append("")
    lines.append("## Labeled Findings")
    lines.append("")
    lines.append("| Finding | Class | Repo | Outcome | Confidence | Notes |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for row in sorted(rows, key=lambda item: item.finding_id):
        note = row.rationale.replace("|", "/")
        lines.append(
            f"| {row.finding_id} | {row.class_id} | `{row.repo}` | {row.human_outcome} | {row.confidence} | {note} |"
        )
    lines.append("")
    return "\n".join(lines)


def parse_release_metrics(path: Path) -> tuple[float, float] | None:
    text = path.read_text(encoding="utf-8")
    precision_value = None
    recall_value = None
    for line in text.splitlines():
        if line.startswith("- Precision:"):
            precision_value = float(line.split(":", 1)[1].strip())
        elif line.startswith("- Recall:"):
            recall_value = float(line.split(":", 1)[1].strip())
    if precision_value is None or recall_value is None:
        return None
    return precision_value, recall_value


def update_trend_markdown(
    *,
    release: str,
    release_md: Path,
    trend_md: Path,
    generated_at: str,
) -> None:
    metrics = parse_release_metrics(release_md)
    if metrics is None:
        raise ValueError(f"could not parse precision/recall from {release_md}")
    p, r = metrics

    rows: list[tuple[str, float, float, str]] = []
    if trend_md.exists():
        for line in trend_md.read_text(encoding="utf-8").splitlines():
            if not line.startswith("| v"):
                continue
            parts = [x.strip() for x in line.strip("|").split("|")]
            if len(parts) != 4:
                continue
            rel, p_raw, r_raw, date = parts
            try:
                rows.append((rel, float(p_raw), float(r_raw), date))
            except ValueError:
                continue

    rows = [row for row in rows if row[0] != release]
    rows.append((release, p, r, generated_at.split("T", 1)[0]))
    rows.sort(key=lambda item: item[0])

    lines = [
        "# Cairo Auditor External Triage Trend",
        "",
        "Release-over-release precision/recall from human-labeled external findings.",
        "",
        "| Release | Precision | Recall | Date |",
        "| --- | ---: | ---: | --- |",
    ]
    for rel, p_val, r_val, date in rows:
        lines.append(f"| {rel} | {p_val:.3f} | {r_val:.3f} | {date} |")
    lines.append("")
    trend_md.parent.mkdir(parents=True, exist_ok=True)
    trend_md.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Score human-labeled external scan findings and update release trend."
    )
    parser.add_argument("--labels", required=True, help="JSONL label file path")
    parser.add_argument(
        "--findings",
        default="",
        help="Optional findings JSONL for labeled-coverage tracking",
    )
    parser.add_argument("--release", required=True, help="Release/version label, e.g. v0.2.0")
    parser.add_argument("--output-md", required=True, help="Release scorecard markdown output path")
    parser.add_argument("--output-json", required=True, help="Release scorecard JSON output path")
    parser.add_argument(
        "--output-unlabeled-jsonl",
        default="",
        help="Optional JSONL output containing unlabeled findings backlog",
    )
    parser.add_argument("--trend-md", required=True, help="Trend markdown output path")
    parser.add_argument("--min-precision", type=float, default=0.7)
    parser.add_argument("--min-recall", type=float, default=0.9)
    parser.add_argument("--min-labeled-coverage", type=float, default=0.0)
    args = parser.parse_args()

    label_path = Path(args.labels)
    output_md = Path(args.output_md)
    output_json = Path(args.output_json)
    trend_md = Path(args.trend_md)

    rows = load_labels(label_path)
    totals = score(rows)

    tp = totals["tp"]
    fp = totals["fp"]
    fn = totals["fn"]
    p = precision(tp, fp)
    r = recall(tp, fn)
    findings_path: Path | None = None
    unlabeled_rows: list[FindingRow] = []
    labeled_coverage = None
    labeled_in_scan = None
    total_findings = None
    if args.findings:
        findings_path = Path(args.findings)
        findings_rows = load_findings(findings_path)
        labeled_keys = {row.finding_key for row in rows}
        finding_keys = {row.finding_key for row in findings_rows}
        unlabeled_rows = [row for row in findings_rows if row.finding_key not in labeled_keys]
        labeled_in_scan = len(finding_keys & labeled_keys)
        total_findings = len(finding_keys)
        labeled_coverage = 1.0 if total_findings == 0 else labeled_in_scan / total_findings
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    unlabeled_scan_id = infer_scan_id(findings_path)

    markdown = render_release_md(
        release=args.release,
        generated_at=generated_at,
        label_path=label_path,
        totals=totals,
        rows=rows,
        findings_path=findings_path,
        labeled_in_scan=labeled_in_scan,
        total_findings=total_findings,
        unlabeled_rows=unlabeled_rows,
    )
    output_md.parent.mkdir(parents=True, exist_ok=True)
    output_md.write_text(markdown + "\n", encoding="utf-8")

    summary = {
        "generated_at": generated_at,
        "release": args.release,
        "labels_path": label_path.as_posix(),
        "totals": totals,
        "precision": p,
        "recall": r,
        "labels_distinct_total": len({row.finding_key for row in rows}),
        "labeled_in_scan": labeled_in_scan,
        "findings_distinct_total": total_findings,
        "labeled_coverage": labeled_coverage,
        "unlabeled_count": len(unlabeled_rows),
        "unlabeled_by_class": dict(Counter(row.class_id for row in unlabeled_rows)),
        "gate": {
            "min_precision": args.min_precision,
            "min_recall": args.min_recall,
            "min_labeled_coverage": args.min_labeled_coverage,
            "passed": p >= args.min_precision and r >= args.min_recall and (
                labeled_coverage is None or labeled_coverage >= args.min_labeled_coverage
            ),
        },
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(summary, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    if args.output_unlabeled_jsonl:
        out_unlabeled = Path(args.output_unlabeled_jsonl)
        out_unlabeled.parent.mkdir(parents=True, exist_ok=True)
        with out_unlabeled.open("w", encoding="utf-8") as handle:
            for i, row in enumerate(unlabeled_rows, start=1):
                handle.write(
                    json.dumps(
                        {
                            "triage_id": f"{unlabeled_scan_id}-UNLABELED-{i:03d}",
                            "scan_id": unlabeled_scan_id,
                            "release": args.release,
                            "repo": row.repo,
                            "ref": row.ref,
                            "file": row.file,
                            "class_id": row.class_id,
                            "scope": row.scope,
                            "status": "needs_review",
                        },
                        ensure_ascii=True,
                    )
                    + "\n"
                )

    update_trend_markdown(
        release=args.release,
        release_md=output_md,
        trend_md=trend_md,
        generated_at=generated_at,
    )

    print(
        json.dumps(
            {
                "labels": len(rows),
                "precision": round(p, 6),
                "recall": round(r, 6),
                "labeled_coverage": round(labeled_coverage, 6) if labeled_coverage is not None else None,
                "unlabeled_count": len(unlabeled_rows),
                "output_md": output_md.as_posix(),
                "output_json": output_json.as_posix(),
                "trend_md": trend_md.as_posix(),
            },
            ensure_ascii=True,
        )
    )

    if p < args.min_precision or r < args.min_recall:
        print(
            f"FAILED: precision={p:.3f} recall={r:.3f} "
            f"thresholds=({args.min_precision:.3f}, {args.min_recall:.3f})"
        )
        return 1
    if labeled_coverage is not None and labeled_coverage < args.min_labeled_coverage:
        print(
            f"FAILED: labeled_coverage={labeled_coverage:.3f} "
            f"< min_labeled_coverage={args.min_labeled_coverage:.3f}"
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
