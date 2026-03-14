# Release Security Gate Checklist

- No unresolved Critical/High findings.
- Required regression tests added for all merged fixes.
- Static analysis and test suites pass.
- Findings disposition table updated.
- Held-out eval gate passes versus baseline scorecard (`evals/scorecards/v0.1.1-audit-pipeline.md`): no High/Critical recall regression and false-positive rate delta <= +1.0 percentage point.
