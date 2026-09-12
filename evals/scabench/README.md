# SCAbench eval harness

Measures `cairo-auditor` against real Cairo code with published ground truth, so
changes to the skill can be judged instead of argued about.

Target: [`code4rena_starknet-perpetual_2025_06`](https://github.com/scabench-org/scabench)
— StarkWare's perpetuals contracts as audited in a Code4rena contest. 53 Cairo
files (40 non-test), **13 known findings**: 2 high, 3 medium, 8 low.

## Why sanitization is the point

A benchmark repository often ships the answer key next to the code: contest
READMEs with a "Known Issues" section, vendored audit reports, changelogs naming
fixes. An auditor run against an unsanitized tree scores its own reading
comprehension, and the number that comes out is worse than no number, because it
looks like evidence.

`prepare.py` therefore strips known answer-key shapes, then **scans everything
that survives for ground-truth leakage and refuses to produce a scoreable target
if it finds any**. It writes a manifest of what it removed and what it checked, so
the sanitization is auditable rather than trusted.

A protocol specification is deliberately not treated as leakage. Real auditors get
the spec, and it is what separates a documented-invariant violation from an
inferred one. Only finding-specific text counts: finding ids, known-issues section
headers, and distinctive phrases from finding titles. `.gz` members are decompressed and scanned rather than skipped by suffix, and any file that cannot be text-searched (binary assets) is listed as `unscanned_files` in the manifest instead of being silently passed over.

For this target the strip pass removes nothing and the leak scan comes back clean
— `docs/SECURITY.md` is a generic reporting policy and `docs/spec.md` is the
protocol spec. That is a verified result, not an assumption.

## Running it

```bash
# 1. Fetch and sanitize (pinned commit, content-hashed)
python3 evals/scabench/prepare.py \
  --project code4rena_starknet-perpetual_2025_06 \
  --out /tmp/scabench-work

# 2. Run the auditor against /tmp/scabench-work/source, writing report JSON

# 3. Score the run
python3 evals/scabench/score.py \
  --project code4rena_starknet-perpetual_2025_06 \
  --report /tmp/scabench-work/report.json
```

Reproducibility is pinned two ways and **both are enforced**: the commit
`9e48514c6151a9b65ee23b4a6f9bced8c6f2b793`, and a content digest over `.cairo`
files only (`72778c4e...`), which stays stable even if the host re-compresses its
tarballs. `prepare.py` compares the digest against the value recorded in the
ground truth and refuses to produce a target on mismatch — an earlier revision
computed and printed the digest without ever checking it, which made the second
pin decorative.

## What the scorer is, and is not

It is **not** a judge. SCAbench's own scorer prompts a model to decide whether a
reported finding matches an expected one — more accurate than anything textual,
but it costs tokens per scoring run and is nondeterministic, which is the wrong
shape for a gate you want to run often.

So `score.py` produces a deterministic ranking and is explicit about its limits.
It reports recall as a range (floor counts confident matches, ceiling adds review
candidates) and prints the top three candidates per expected finding for a human
to confirm. **On this dataset a true match has been observed ranking second behind
a false one that shared generic words**, which is precisely why the top hit is not
trusted on its own. Confirming 13 findings by eye takes a few minutes, once.

## Baseline measurements (2026-08-18)

**Deterministic preflight: 0 findings on 40 prod Cairo files with 13 known bugs.**
Verified as a real result rather than a broken scan — the preflight reports 53
files discovered, produces 0 with default detectors and 0 with the 12-detector
benchmark bridge enabled, and fires 3 findings on the known-bad fixture.

Partly expected: 11 of the 13 findings are economic or business-logic bugs
(deleveraging, liquidation ordering, funding rates, stale prices) that pattern
detectors cannot reach by construction. The useful conclusion is scope — on real
DeFi code the deterministic layer contributes approximately nothing, and the LLM
specialists carry essentially all of the recall.

For reference, the published GPT-5 baseline reported 19 findings using 140,955
tokens. Its overlap with ground truth is unconfirmed pending the review pass; two
plausible matches are visible by eye (`price_tick` and `owner_account`).

The agent-run recall number is not recorded here because it costs real tokens.
The harness makes it a single command when that spend is worth it.
