#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


CLASS_DESCRIPTIONS: dict[str, str] = {
    "AA-SELF-CALL-SESSION": (
        "Session-key or delegated execute path allows calls to self without explicit guard, "
        "enabling privilege escalation via internal selectors."
    ),
    "UNCHECKED_FEE_BOUND": (
        "Fee parameter is accepted/written/used without explicit upper-bound assertion."
    ),
    "SHUTDOWN_OVERRIDE_PRECEDENCE": (
        "Fixed/manual shutdown override exists but dynamic inferred value takes precedence first."
    ),
    "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": (
        "Code retries a syscall by swapping selector casing/name on error, assuming fallback compatibility."
    ),
    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": (
        "Upgrade executes replace_class directly in privileged function without schedule-delay-execute timelock."
    ),
    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": (
        "Upgrade path accepts class hash without explicit non-zero guard before upgrade."
    ),
    "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": (
        "Constructor/initializer stores critical addresses without explicit non-zero assertions."
    ),
    "CONSTRUCTOR_DEAD_PARAM": (
        "Constructor accepts a parameter that is never used in constructor logic, indicating misleading or dead initialization surface."
    ),
    "FEES_RECIPIENT_ZERO_DOS": (
        "Fee recipient address is stored without non-zero guard and later used in transfer/mint flow, risking permanent revert-based DOS."
    ),
    "NO_ACCESS_CONTROL_MUTATION": (
        "State-changing privileged/configuration mutation function is callable without explicit caller/role/owner access control."
    ),
    "CEI_VIOLATION_ERC1155": (
        "Function performs ERC1155 safe_transfer_from external interaction before critical state updates, enabling callback reentrancy risk."
    ),
    "IRREVOCABLE_ADMIN": (
        "Contract seeds privileged admin/owner authority at initialization but exposes no rotation/transfer/revocation path."
    ),
    "ONE_SHOT_REGISTRATION": (
        "Critical dependency address registration is write-once with no operational recovery/update route if initial value is wrong or compromised."
    ),
}


@dataclass
class EvalCase:
    case_id: str
    class_id: str
    expected_detect: bool
    code: str
    source: str
    source_url: str | None


def load_cases(path: Path) -> list[EvalCase]:
    cases: list[EvalCase] = []
    seen: set[str] = set()
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        for key in ("case_id", "class_id", "expected_detect", "code", "source"):
            if key not in raw:
                raise ValueError(f"line {i}: missing key '{key}'")
        case_id = raw["case_id"]
        if case_id in seen:
            raise ValueError(f"line {i}: duplicate case_id '{case_id}'")
        seen.add(case_id)
        cases.append(
            EvalCase(
                case_id=case_id,
                class_id=raw["class_id"],
                expected_detect=bool(raw["expected_detect"]),
                code=raw["code"],
                source=raw["source"],
                source_url=raw.get("source_url"),
            )
        )
    return cases


def precision(tp: int, fp: int) -> float:
    denom = tp + fp
    return 1.0 if denom == 0 else tp / denom


def recall(tp: int, fn: int) -> float:
    denom = tp + fn
    return 1.0 if denom == 0 else tp / denom


def build_messages(case: EvalCase) -> list[dict[str, str]]:
    class_description = CLASS_DESCRIPTIONS.get(case.class_id, "No class description available.")
    system = (
        "You are a Cairo smart-contract security reviewer. "
        "Given one vulnerability class and one code snippet, decide if the class is present. "
        "Return strict JSON with keys: detected (boolean), confidence (low|medium|high), reason (string). "
        "Do not invent external context. Base the decision only on explicit code evidence."
    )
    user = (
        f"Class ID: {case.class_id}\n"
        f"Class description: {class_description}\n"
        "Task: detect only this class. Ignore unrelated issues.\n"
        "Mark detected=true only when concrete code patterns in the snippet satisfy the class definition.\n"
        "If a direct guard/fix for this class exists, prefer detected=false.\n"
        "Code:\n"
        "```cairo\n"
        f"{case.code}\n"
        "```\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def parse_model_json(text: str) -> dict:
    text = text.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("model output is not valid JSON object")


def run_single_case(
    *,
    api_url: str,
    api_key: str,
    model: str,
    case: EvalCase,
    timeout_seconds: int,
    retries: int,
    retry_base_seconds: float,
) -> dict[str, object]:
    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": build_messages(case),
    }
    body = json.dumps(payload).encode("utf-8")

    last_err = ""
    for attempt in range(retries + 1):
        request = urllib.request.Request(
            url=api_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = json.loads(response.read().decode("utf-8"))
            content = raw["choices"][0]["message"]["content"]
            parsed = parse_model_json(content)
            detected = bool(parsed.get("detected", False))
            confidence = str(parsed.get("confidence", "medium")).lower()
            if confidence not in {"low", "medium", "high"}:
                confidence = "medium"
            reason = str(parsed.get("reason", ""))[:500]
            return {
                "case_id": case.case_id,
                "class_id": case.class_id,
                "expected_detect": case.expected_detect,
                "predicted_detect": detected,
                "confidence": confidence,
                "reason": reason,
                "source": case.source,
                "source_url": case.source_url,
                "error": "",
            }
        except urllib.error.HTTPError as exc:
            last_err = f"HTTP {exc.code}: {exc.reason}"
            if attempt < retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                delay = retry_base_seconds * (2**attempt)
                if retry_after and retry_after.isdigit():
                    delay = max(delay, float(retry_after))
                if exc.code in {408, 409, 425, 429} or exc.code >= 500:
                    time.sleep(min(delay, 30.0))
                    continue
        except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError) as exc:
            last_err = str(exc)
            if attempt < retries:
                time.sleep(min(retry_base_seconds * (2**attempt), 30.0))
                continue

    return {
        "case_id": case.case_id,
        "class_id": case.class_id,
        "expected_detect": case.expected_detect,
        "predicted_detect": False,
        "confidence": "low",
        "reason": "",
        "source": case.source,
        "source_url": case.source_url,
        "error": f"model_call_failed: {last_err[:300]}",
    }


def render_markdown(
    *,
    model: str,
    cases_path: Path,
    generated_at: str,
    totals: dict[str, int],
    results: list[dict[str, object]],
) -> str:
    tp = totals["tp"]
    tn = totals["tn"]
    fp = totals["fp"]
    fn = totals["fn"]
    total = tp + tn + fp + fn

    p = precision(tp, fp)
    r = recall(tp, fn)
    acc = (tp + tn) / total if total else 1.0

    lines: list[str] = []
    lines.append("# Cairo Auditor LLM Held-out Eval")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Model: `{model}`")
    lines.append(f"Case pack: `{cases_path.as_posix()}`")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Cases: {total}")
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
    lines.append("## Case Outcomes")
    lines.append("")
    lines.append("| Case | Class | Expected | Predicted | Confidence | Outcome | Notes |")
    lines.append("| --- | --- | ---: | ---: | --- | --- | --- |")
    for row in results:
        expected = bool(row["expected_detect"])
        predicted = bool(row["predicted_detect"])
        if predicted and expected:
            outcome = "tp"
        elif predicted and not expected:
            outcome = "fp"
        elif not predicted and expected:
            outcome = "fn"
        else:
            outcome = "tn"
        notes = row.get("error") or row.get("reason") or ""
        notes = str(notes).replace("|", "/")[:120]
        lines.append(
            f"| {row['case_id']} | {row['class_id']} | {str(expected).lower()} | {str(predicted).lower()} | {row['confidence']} | {outcome} | {notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run LLM-based held-out eval for cairo-auditor.")
    parser.add_argument("--cases", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", required=True)
    parser.add_argument("--model", default="openai/gpt-4o")
    parser.add_argument("--api-url", default="https://models.github.ai/inference/chat/completions")
    parser.add_argument("--auth-env", default="GITHUB_TOKEN")
    parser.add_argument("--min-precision", type=float, default=0.75)
    parser.add_argument("--min-recall", type=float, default=0.75)
    parser.add_argument("--timeout-seconds", type=int, default=45)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--retry-base-seconds", type=float, default=2.0)
    args = parser.parse_args()

    api_key = os.environ.get(args.auth_env, "").strip()
    if not api_key and args.auth_env != "OPENAI_API_KEY":
        # Backward-compatible local fallback.
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            f"{args.auth_env} is required for LLM eval "
            "(or OPENAI_API_KEY for compatibility fallback)"
        )

    cases_path = Path(args.cases)
    out_json = Path(args.output_json)
    out_md = Path(args.output_md)
    cases = load_cases(cases_path)

    results: list[dict[str, object]] = []
    totals = {"tp": 0, "tn": 0, "fp": 0, "fn": 0}

    for case in cases:
        row = run_single_case(
            api_url=args.api_url,
            api_key=api_key,
            model=args.model,
            case=case,
            timeout_seconds=args.timeout_seconds,
            retries=args.retries,
            retry_base_seconds=args.retry_base_seconds,
        )
        expected = bool(row["expected_detect"])
        predicted = bool(row["predicted_detect"])
        if predicted and expected:
            totals["tp"] += 1
        elif predicted and not expected:
            totals["fp"] += 1
        elif not predicted and expected:
            totals["fn"] += 1
        else:
            totals["tn"] += 1
        results.append(row)

    p = precision(totals["tp"], totals["fp"])
    r = recall(totals["tp"], totals["fn"])
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    report = {
        "generated_at": generated_at,
        "model": args.model,
        "cases": len(cases),
        "precision": p,
        "recall": r,
        "totals": totals,
        "results": results,
        "gate": {
            "min_precision": args.min_precision,
            "min_recall": args.min_recall,
            "passed": p >= args.min_precision and r >= args.min_recall,
        },
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(
        render_markdown(
            model=args.model,
            cases_path=cases_path,
            generated_at=generated_at,
            totals=totals,
            results=results,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "cases": len(cases),
                "precision": round(p, 6),
                "recall": round(r, 6),
                "output_json": out_json.as_posix(),
                "output_md": out_md.as_posix(),
            },
            ensure_ascii=True,
        )
    )
    error_rows = [row for row in results if row.get("error")]
    if error_rows:
        counts: dict[str, int] = {}
        for row in error_rows:
            key = str(row["error"])[:180]
            counts[key] = counts.get(key, 0) + 1
        sample = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:5]
        print(
            json.dumps(
                {
                    "error_cases": len(error_rows),
                    "error_kinds": [{"error": err, "count": count} for err, count in sample],
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

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
