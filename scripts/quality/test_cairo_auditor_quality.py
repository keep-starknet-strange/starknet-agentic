#!/usr/bin/env python3
"""Tests for the cairo-auditor quality harnesses added in this change:
#1 recall/taxonomy eval and #2 default-vs-deep A/B comparison.
"""

from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"_qual_{name}", HERE / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ab = _load("ab_default_vs_deep")
recall = _load("recall_eval_cairo_auditor")


def _finding(**kw):
    base = {
        "title": "t",
        "class_id": "NO_ACCESS_CONTROL_MUTATION",
        "file": "src/a.cairo",
        "root_cause": "rc",
        "severity": "High",
        "confidence": 80,
        "evidence_tags": ["[CODE-TRACE]"],
    }
    base.update(kw)
    return base


class ABCompareTest(unittest.TestCase):
    def test_deep_only_medium_plus_earns_cost(self):
        default = [_finding(root_cause="shared")]
        deep = [
            _finding(root_cause="shared"),
            _finding(
                root_cause="cross-fn-payout",
                title="cross fn",
                severity="High",
                evidence_tags=["[CODE-TRACE]", "[ADVERSARIAL]"],
            ),
        ]
        m = ab.compare(default, deep)
        self.assertEqual(m["in_both"], 1)
        self.assertEqual(m["deep_only_count"], 1)
        self.assertEqual(m["deep_only_medium_plus"], 1)
        self.assertEqual(m["adversarial_attributable_count"], 1)
        self.assertTrue(m["verdict_earned"])
        self.assertIn("EARNED", m["verdict"])

    def test_no_marginal_value_not_earned(self):
        default = [_finding(root_cause="shared")]
        deep = [_finding(root_cause="shared")]
        m = ab.compare(default, deep)
        self.assertEqual(m["deep_only_count"], 0)
        self.assertFalse(m["verdict_earned"])
        self.assertIn("NOT EARNED", m["verdict"])

    def test_low_only_is_marginal(self):
        default = [_finding(root_cause="shared")]
        deep = [_finding(root_cause="shared"), _finding(root_cause="low", severity="Low")]
        m = ab.compare(default, deep)
        self.assertFalse(m["verdict_earned"])
        self.assertIn("MARGINAL", m["verdict"])

    def test_only_default_flags_regression(self):
        default = [_finding(root_cause="shared"), _finding(root_cause="dropped")]
        deep = [_finding(root_cause="shared")]
        m = ab.compare(default, deep)
        self.assertEqual(len(m["only_default"]), 1)


class RecallMappingTest(unittest.TestCase):
    def test_maps_shutdown(self):
        f = {"root_cause": "x", "tags": ["shutdown", "priority-order"]}
        self.assertEqual(recall.map_class(f), "SHUTDOWN_OVERRIDE_PRECEDENCE")

    def test_maps_fee_bound(self):
        f = {"root_cause": "fee parameter without an upper bound", "tags": []}
        self.assertEqual(recall.map_class(f), "UNCHECKED_FEE_BOUND")

    def test_out_of_taxonomy_returns_none(self):
        f = {"root_cause": "merkle proof malleability in signature verification", "tags": ["merkle", "signature"]}
        self.assertIsNone(recall.map_class(f))

    def test_evaluable_rejects_placeholder(self):
        self.assertFalse(recall._is_evaluable({"vulnerable_snippet": "See source audit finding..."}))
        self.assertTrue(
            recall._is_evaluable({"vulnerable_snippet": "fn upgrade(ref self){ self.x.write(new_class_hash); }"})
        )

    def test_evaluate_counts_total_and_buckets(self):
        findings = [
            {"finding_id": "1", "severity_normalized": "high", "tags": ["shutdown"], "root_cause": "shutdown order", "vulnerable_snippet": "See source audit finding..."},
            {"finding_id": "2", "severity_normalized": "critical", "tags": ["merkle"], "root_cause": "merkle issue", "vulnerable_snippet": "x"},
        ]
        m = recall.evaluate(findings, {})
        self.assertEqual(m["total_findings"], 2)
        self.assertEqual(m["mapped_in_taxonomy"], 1)
        self.assertEqual(m["out_of_taxonomy"], 1)


if __name__ == "__main__":
    unittest.main()
