# Report Formatting

## Report Path

When `--file-output` is set, save the report to `{repo-root}/security-review-{timestamp}.md` where `{timestamp}` is `YYYYMMDD-HHMMSS` at scan time (middle `MM` denotes minutes).

## Output Format

````markdown
# Security Review — <project name or repo basename>

---

## Scope

|                                  |                                                        |
| -------------------------------- | ------------------------------------------------------ |
| **Mode**                         | default / deep / targeted                              |
| **Files reviewed**               | `file1.cairo` · `file2.cairo`<br>`file3.cairo` · `file4.cairo` |
| **Total in-scope lines**         | N                                                      |
| **Confidence threshold (0-100)** | 75                                                     |
| **Preflight findings**           | N deterministic hits                                   |

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
- merge broader attack path details,
- keep a single fix/test block.
