#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def _portable(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.name


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _finding_key(row: dict[str, object]) -> tuple[str, str, str]:
    return (str(row.get("repo", "")), str(row.get("file", "")), str(row.get("class_id", "")))


def _render_markdown(
    *,
    title: str,
    baseline_label: str,
    rerun_label: str,
    baseline_path: str,
    rerun_path: str,
    baseline_count: int,
    rerun_count: int,
    baseline_by_class: dict[str, int],
    rerun_by_class: dict[str, int],
    removed: list[dict[str, str]],
    added: list[dict[str, str]],
) -> str:
    classes = sorted(set(baseline_by_class) | set(rerun_by_class))
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"- {baseline_label}: `{baseline_path}`")
    lines.append(f"- {rerun_label}: `{rerun_path}`")
    lines.append("")
    lines.append(f"- {baseline_label} findings: **{baseline_count}**")
    lines.append(f"- {rerun_label} findings: **{rerun_count}**")
    lines.append(f"- Delta: **{rerun_count - baseline_count:+d}**")
    lines.append("")
    lines.append("## By Class")
    lines.append("")
    lines.append("| Class | Baseline | Rerun | Delta |")
    lines.append("| --- | ---: | ---: | ---: |")
    for class_id in classes:
        b = baseline_by_class.get(class_id, 0)
        r = rerun_by_class.get(class_id, 0)
        lines.append(f"| `{class_id}` | {b} | {r} | {r - b:+d} |")
    lines.append("")
    lines.append(f"- Removed: **{len(removed)}**")
    lines.append("")
    if removed:
        lines.append("| Repo | File | Class |")
        lines.append("| --- | --- | --- |")
        for row in removed:
            lines.append(f"| `{row['repo']}` | `{row['file']}` | `{row['class_id']}` |")
        lines.append("")
    lines.append(f"- Added: **{len(added)}**")
    lines.append("")
    if added:
        lines.append("| Repo | File | Class |")
        lines.append("| --- | --- | --- |")
        for row in added:
            lines.append(f"| `{row['repo']}` | `{row['file']}` | `{row['class_id']}` |")
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two external scan JSON artifacts.")
    parser.add_argument("--baseline", required=True, help="Baseline scan JSON")
    parser.add_argument("--rerun", required=True, help="Rerun scan JSON")
    parser.add_argument("--output-json", required=True, help="Comparison JSON output")
    parser.add_argument("--output-md", required=True, help="Comparison markdown output")
    parser.add_argument("--title", default="External Scan Delta")
    parser.add_argument("--baseline-label", default="Baseline")
    parser.add_argument("--rerun-label", default="Rerun")
    args = parser.parse_args()

    baseline_path = Path(args.baseline)
    rerun_path = Path(args.rerun)
    out_json = Path(args.output_json)
    out_md = Path(args.output_md)

    baseline = _load(baseline_path)
    rerun = _load(rerun_path)
    baseline_findings = list(baseline.get("findings", []))
    rerun_findings = list(rerun.get("findings", []))

    baseline_keys = {_finding_key(row): row for row in baseline_findings if isinstance(row, dict)}
    rerun_keys = {_finding_key(row): row for row in rerun_findings if isinstance(row, dict)}

    removed_keys = sorted(set(baseline_keys) - set(rerun_keys))
    added_keys = sorted(set(rerun_keys) - set(baseline_keys))

    removed = [{"repo": k[0], "file": k[1], "class_id": k[2]} for k in removed_keys]
    added = [{"repo": k[0], "file": k[1], "class_id": k[2]} for k in added_keys]

    baseline_by_class = dict(sorted(Counter(k[2] for k in baseline_keys).items()))
    rerun_by_class = dict(sorted(Counter(k[2] for k in rerun_keys).items()))

    payload = {
        "baseline": _portable(baseline_path),
        "rerun": _portable(rerun_path),
        "baseline_findings": len(baseline_keys),
        "rerun_findings": len(rerun_keys),
        "delta_findings": len(rerun_keys) - len(baseline_keys),
        "baseline_by_class": baseline_by_class,
        "rerun_by_class": rerun_by_class,
        "removed": removed,
        "added": added,
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    markdown = _render_markdown(
        title=args.title,
        baseline_label=args.baseline_label,
        rerun_label=args.rerun_label,
        baseline_path=_portable(baseline_path),
        rerun_path=_portable(rerun_path),
        baseline_count=len(baseline_keys),
        rerun_count=len(rerun_keys),
        baseline_by_class=baseline_by_class,
        rerun_by_class=rerun_by_class,
        removed=removed,
        added=added,
    )
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(markdown, encoding="utf-8")

    print(
        json.dumps(
            {
                "baseline_findings": len(baseline_keys),
                "rerun_findings": len(rerun_keys),
                "delta_findings": len(rerun_keys) - len(baseline_keys),
                "output_json": out_json.as_posix(),
                "output_md": out_md.as_posix(),
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
