# Report Formatting

## Report Path

When `--file-output` is set, save the report to `{repo-root}/security-review-{timestamp}.md` where `{timestamp}` is `YYYYMMDD-HHMMSS` at scan time (middle `MM` denotes minutes).

## Output Format

````markdown
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
| **Preflight findings**           | N deterministic hits                                   |
| **Generated**                    | ISO8601 timestamp                                      |

`Execution Integrity: <FULL|DEGRADED|FAILED>`

---

## Execution Trace

| Stage | Model | Evidence | Status |
|-------|-------|----------|--------|
| Scope discovery | n/a | `{workdir}/cairo-audit-files.txt` (N files) | OK |
| Agent 1 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-1-bundle.md` (N lines) | OK |
| Agent 2 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-2-bundle.md` (N lines) | OK |
| Agent 3 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-3-bundle.md` (N lines) | OK |
| Agent 4 vector scan | `<actual model label>` | `{workdir}/cairo-audit-agent-4-bundle.md` (N lines) | OK |
| Agent 5 adversarial (deep only) | `<actual model label>` | direct read from `{workdir}/cairo-audit-files.txt` | OK / SKIPPED / FAILED |

---

## Findings

[P0] **1. <Title>**

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 92 · Severity: Critical

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

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 85 · Severity: High

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

`Class: CLASS_ID` · `file.cairo:line` · Confidence: 68 · Severity: Medium

**Description**
<One paragraph: exploit path and impact.>

---

< ... remaining findings ... >

---

## Findings Index

| # | Priority | Confidence | Severity | Title |
|---|----------|------------|----------|-------|
| 1 | P0       | [92]       | Critical | <title> |
| 2 | P1       | [85]       | High     | <title> |
|   |          |            |          | **Below Confidence Threshold** |
| 3 | P2       | [68]       | Medium   | <title> |
| 4 | P3       | [55]       | Low      | <title> |

---

> This review was performed by an AI assistant. AI analysis cannot verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, formal audits, bug bounty programs, and on-chain monitoring are strongly recommended.

````

## Rules

- Follow the template above exactly.
- Always include `Signal Summary`, `Scope`, `Execution Trace`, `Findings`, and `Findings Index` in that order.
- In `Signal Summary`, `Total` must equal `Critical + High + Medium + Low`. If any input `Total` differs, recompute and overwrite it.
- `Execution Trace` must include scope discovery and Agents 1-4 for every run.
- In deep mode, `Execution Trace` must include Agent 5 with actual model label and status.
- In non-deep modes, keep Agent 5 row with `Status: SKIPPED`.
- `Execution Trace` evidence paths must reference `{workdir}` (resolved from `CAIRO_AUDITOR_WORKDIR` or a per-run private temp directory).
- If any specialist is unavailable and degraded mode is explicitly enabled, set `Execution Integrity: DEGRADED` and include the warning line under Scope.
- If scope discovery or any required stage (Agents 1-4 and Agent 5 in deep mode) has `Status: FAILED` and degraded mode is not explicitly enabled, set `Execution Integrity: FAILED` and abort report generation (no findings output).
- Sort findings by priority (`P0` first); within each priority tier, sort by confidence (highest first).
- Findings below threshold (confidence < 75) get a description but no **Fix** block and no **Required Tests** block.
- After filtering/deduplication/sorting, renumber findings sequentially starting at `1`.
- Do not re-draft or paraphrase finding content. Apply only the required structural transformations (FP-gate filtering, deduplication, sorting, threshold-based block removal, renumbering, and canonical section ordering), then emit the finding text verbatim.
- If any findings have confidence < 75, insert one **Below Confidence Threshold** separator row in the Findings Index immediately before the first below-threshold finding.
- Findings that fail FP gate must be dropped entirely and not reported.

## Finding Template (per finding)

Use this exact per-finding structure:

- `[P{priority}] **{index}. {title}**`
- `` `Class: {class_id}` · `{file}:{line}` · Confidence: {score} · Severity: {severity} ``
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
