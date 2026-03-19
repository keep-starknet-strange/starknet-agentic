# Report Formatting

## Report Path

When `--file-output` is set, save the report to `{repo-root}/security-review-{timestamp}.md` where `{timestamp}` is `YYYYMMDD-HHMMSS` at scan time (middle `MM` denotes minutes).

## Output Format

````markdown
```text
 ██████╗ █████╗ ██╗██████╗  ██████╗      █████╗ ██╗   ██╗██████╗ ██╗████████╗ ██████╗ ██████╗
██╔════╝██╔══██╗██║██╔══██╗██╔═══██╗    ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝██╔═══██╗██╔══██╗
██║     ███████║██║██████╔╝██║   ██║    ███████║██║   ██║██║  ██║██║   ██║   ██║   ██║██████╔╝
██║     ██╔══██║██║██╔══██╗██║   ██║    ██╔══██║██║   ██║██║  ██║██║   ██║   ██║   ██║██╔══██╗
╚██████╗██║  ██║██║██║  ██║╚██████╔╝    ██║  ██║╚██████╔╝██████╔╝██║   ██║   ╚██████╔╝██║  ██║
 ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
```

# Security Review — <project name or repo basename>

## Signal Summary

| Critical | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| N        | N    | N      | N   | N     |

---

## Scope

|                                  |                                                        |
| -------------------------------- | ------------------------------------------------------ |
| **Mode**                         | default / deep / targeted                              |
| **Files reviewed**               | `file1.cairo` · `file2.cairo`<br>`file3.cairo` · `file4.cairo` |
| **Total in-scope lines**         | N                                                      |
| **Confidence threshold (0-100)** | 75                                                     |
| **Proven-only mode**             | on / off                                               |
| **Preflight findings**           | N deterministic hits                                   |
| **Generated**                    | ISO8601 timestamp                                      |

`Execution Integrity: <FULL|DEGRADED|FAILED>`

When degraded:

`WARNING: degraded execution (specialist agents unavailable or strict-model fallback)`

---

## Execution Trace

| Stage | Model | Evidence | Status |
|---|---|---|---|
| Scope discovery | n/a | `{workdir}/cairo-audit-files.txt` (N files) | OK |
| Threat intel enrichment (optional) | n/a | `{workdir}/cairo-audit-threat-intel.md` | OK / `SKIPPED: <reason>` / `FAILED: <reason>` |
| Agent 1 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-1-bundle.md` (N lines) | OK |
| Agent 2 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-2-bundle.md` (N lines) | OK |
| Agent 3 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-3-bundle.md` (N lines) | OK |
| Agent 4 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-4-bundle.md` (N lines) | OK |
| Agent 5 adversarial (deep only) | `<actual model label>` | direct read from `{workdir}/cairo-audit-files.txt` | OK / SKIPPED / FAILED |

---

## Findings

[P0] **1. <Title>**

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 92 · Severity: Critical · `[CODE-TRACE] [PREFLIGHT-HIT]`

**Description**
<One paragraph: exploit path and impact.>

**Fix**

```diff
- vulnerable line(s)
+ fixed line(s)
```

**Required Tests**
- Regression test that reproduces the vulnerable path.
- Guard test that proves fix blocks exploit.

---

[P1] **2. <Title>**

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 85 · Severity: High · `[CODE-TRACE] [CROSS-AGENT]`

**Description**
<One paragraph: exploit path and impact.>

**Fix**

```diff
- vulnerable line(s)
+ fixed line(s)
```

**Required Tests**
- Regression test that reproduces the vulnerable path.
- Guard test that proves fix blocks exploit.

---

[P2] **3. <Title (below threshold example)>**

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 68 · Severity: Medium · `[CODE-TRACE]`

**Description**
<One paragraph: exploit path and impact.>

---

< ... remaining findings ... >

---

## Dropped Candidates

| Candidate | Class | Drop Reason |
|-----------|-------|-------------|
| `<candidate title>` | `CLASS_ID` | `false_positive` |
| `<candidate title>` | `CLASS_ID` | `duplicate_root_cause` |

When no candidates are dropped:

| Candidate | Class | Drop Reason |
|-----------|-------|-------------|
| `none` | `n/a` | `n/a` |

---

When degraded:

`WARNING: degraded execution may omit exploitable paths`

---

## Findings Index

| # | Priority | Confidence | Severity | Evidence | Title |
|---|----------|------------|----------|----------|-------|
| 1 | P0       | 92         | Critical | `[CODE-TRACE] [PREFLIGHT-HIT]` | <title> |
| 2 | P1       | 85         | High     | `[CODE-TRACE] [CROSS-AGENT]` | <title> |
|   |          |            |          |  | **Below Confidence Threshold** |
| 3 | P2       | 68         | Medium   | `[CODE-TRACE]` | <title> |
| 4 | P3       | 55         | Low      | `[CODE-TRACE]` | <title> |

---

> **Disclaimer.** This review was performed by an automated AI tool. Automated analysis catches pattern-based vulnerabilities but cannot detect specification bugs, economic exploits, cross-protocol interactions, or game-theoretic attacks. This report does not guarantee the absence of vulnerabilities. Use it as a pre-commit and pre-deployment gate — not as a substitute for professional security audits, formal verification, or manual code review.

````

## Rules

- Follow the template above exactly.
- Default section order is `Signal Summary`, `Scope`, `Execution Trace`, `Findings`, `Dropped Candidates`, then `Findings Index`.
- In `Signal Summary`, `Total` must equal `Critical + High + Medium + Low`. If any input `Total` differs, recompute and overwrite it.
- `Execution Trace` must include scope discovery and Agents 1-4 for every run.
- In deep mode, `Execution Trace` must include Agent 5 with actual model label and status.
- In non-deep modes, keep Agent 5 row with `Status: SKIPPED`.
- `Execution Trace` evidence paths must reference `{workdir}` (resolved from `CAIRO_AUDITOR_WORKDIR` or a per-run private temp directory).
- Keep the optional threat-intel row in the execution trace. Use `SKIPPED` when intel fetch is unavailable/offline.
- For threat-intel stage, include explicit reason details (`SKIPPED: no curl`, `SKIPPED: offline`, or `FAILED: curl error <code>`).
- If any specialist is unavailable and degraded mode is explicitly enabled, set `Execution Integrity: DEGRADED` and include the warning line under Scope.
- If scope discovery or any required stage (Agents 1-4 and Agent 5 in deep mode) has `Status: FAILED` and degraded mode is not explicitly enabled, set `Execution Integrity: FAILED` and stop after `Execution Trace` (do not emit `Findings`, `Dropped Candidates`, or `Findings Index`).
- If degraded execution is used, repeat the warning again immediately before `Findings Index`.
- Every finding must include `Evidence` tags in the finding line and in `Findings Index`.
- Allowed evidence tags: `[CODE-TRACE]`, `[PREFLIGHT-HIT]`, `[CROSS-AGENT]`, `[ADVERSARIAL]`.
- If `--proven-only` is enabled, cap severity to `Low` for findings whose strongest evidence is only `[CODE-TRACE]` (no `[PREFLIGHT-HIT]`, `[CROSS-AGENT]`, or `[ADVERSARIAL]`).
- Sort findings by priority (`P0` first); within each priority tier, sort by confidence (highest first).
- Findings below threshold (confidence < 75) get a description but no **Fix** block and no **Required Tests** block.
- After filtering/deduplication/sorting, renumber findings sequentially starting at `1`.
- Do not re-draft or paraphrase finding content. Apply only the required structural transformations (FP-gate filtering, deduplication, sorting, threshold-based block removal, renumbering, and canonical section ordering), then emit the finding text verbatim.
- Threat-intel signals are prioritization hints only. Do not include intel-only findings; each reported finding must be proven from in-scope code and pass FP gate.
- If any findings have confidence < 75, insert one **Below Confidence Threshold** separator row in the Findings Index immediately before the first below-threshold finding.
- Findings that fail FP gate must be dropped entirely and not reported.
- Every finding must carry at least one evidence tag per `../references/judging.md` Evidence Tags section.
- The orchestrator adds `[PREFLIGHT-HIT]` when deterministic preflight flagged the same class/entry.
- The orchestrator adds `[CROSS-AGENT]` when 2+ agents independently reported the same root cause before deduplication.
- The orchestrator adds `[ADVERSARIAL]` when Agent 5 discovered or confirmed the finding.
- Evidence tags appear in the metadata line after severity and in the Findings Index `Evidence` column.
- Track dropped candidates in `Dropped Candidates` with one of: `false_positive`, `duplicate_root_cause`, `below_confidence_threshold`, `insufficient_evidence`.
- If no candidates are dropped, still emit `Dropped Candidates` with a single `none` row.

## Finding Template (per finding)

Use this exact per-finding structure:

- `[P{priority}] **{index}. {title}**`
- `` `Class: {class_id}` · `{file}:{line}` · Confidence: {score} · Severity: {severity} · `{evidence_tags}` ``
- `**Description**` then one paragraph with concrete exploit path and impact.
- `**Fix**` then a `diff` block (only for confidence >= 75).
- `**Required Tests**` then bullet list (only for confidence >= 75).

## Priority Mapping

- `P0`: direct loss, permanent lock, or upgrade takeover.
- `P1`: high-impact auth/logic flaw with realistic exploit path.
- `P2`: medium-impact misconfiguration or constrained exploit.
- `P3`: low-impact hardening issue.

## Deduplication Rule

When two findings share the same root cause, keep one:

- keep higher confidence,
- on confidence tie, keep higher priority (`P0` > `P1` > `P2` > `P3`),
- if both tie, keep the finding with the more complete path/evidence,
- merge broader attack path details,
- keep a single fix/test block.
