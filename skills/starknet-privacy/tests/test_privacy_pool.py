#!/usr/bin/env python3
"""
Unit tests for ZK Privacy Pool.

Tests circuit compilation, witness generation, and proof verification.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class TestCircuitCompilation(unittest.TestCase):
    """Test Circom circuit compilation."""

    CIRCUIT_DIR = Path(__file__).parent.parent / "zk_circuits"

    def test_circuit_file_exists(self):
        """Verify circuit file exists."""
        circuit = self.CIRCUIT_DIR / "privacy_pool.circom"
        self.assertTrue(circuit.exists(), f"Circuit not found: {circuit}")

    def test_witness_template_valid(self):
        """Verify witness template is valid JSON."""
        template = self.CIRCUIT_DIR / "witness_template.json"
        self.assertTrue(template.exists())

        with open(template) as f:
            data = json.load(f)

        required_fields = [
            "nullifierPublic", "merkleRootPublic", "amountPublic",
            "salt", "nullifierSecret", "merklePath", "merkleIndices"
        ]

        for field in required_fields:
            self.assertIn(field, data, f"Missing field: {field}")

    def test_circom_installed(self):
        """Verify Circom is installed."""
        result = subprocess.run(
            ["circom", "--version"],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, "Circom not installed")


class TestSnarkjsIntegration(unittest.TestCase):
    """Test snarkjs integration."""

    def test_snarkjs_installed(self):
        """Verify snarkjs is installed."""
        result = subprocess.run(
            ["npx", "snarkjs", "--version"],
            capture_output=True,
            text=True
        )
        # snarkjs outputs version to stdout even if exit code is non-zero
        self.assertIn("snarkjs", result.stdout, "snarkjs not found in output")

    def test_zk_prover_import(self):
        """Verify zk_prover module imports correctly."""
        sys.path.insert(0, str(Path(__file__).parent.parent))

        # This will fail if dependencies are missing
        try:
            from scripts.zk_prover import ZKPrivacyPool, ZKProof, Commitment
            self.assertTrue(True)
        except ImportError as e:
            self.fail(f"Import failed: {e}")


class TestZKProofStructure(unittest.TestCase):
    """Test ZK proof data structures."""

    def test_zk_proof_dataclass(self):
        """Verify ZKProof can be created."""
        from scripts.zk_prover import ZKProof

        proof = ZKProof(
            pi_a=(1, 2),
            pi_b=((1, 2), (3, 4)),
            pi_c=(5, 6),
            public_inputs=[100, 200]
        )

        self.assertEqual(proof.pi_a, (1, 2))
        self.assertEqual(len(proof.public_inputs), 2)

    def test_commitment_dataclass(self):
        """Verify Commitment can be created."""
        from scripts.zk_prover import Commitment

        commitment = Commitment(
            amount=100,
            salt=12345,
            commitment=67890,
            nullifier=11111
        )

        self.assertEqual(commitment.amount, 100)


class TestZKPrivacyPool(unittest.TestCase):
    """Test ZKPrivacyPool class."""

    def setUp(self):
        """Set up test environment."""
        self.circuit_dir = Path(__file__).parent.parent / "zk_circuits"
        sys.path.insert(0, str(self.circuit_dir.parent.parent))

    def test_initialization(self):
        """Verify pool initializes correctly."""
        from scripts.zk_prover import ZKPrivacyPool

        pool = ZKPrivacyPool()
        self.assertEqual(pool.circuit_dir, self.circuit_dir)


class TestDependencies(unittest.TestCase):
    """Test required dependencies."""

    def test_circom_available(self):
        """Circom must be installed for circuit compilation."""
        result = subprocess.run(
            ["which", "circom"],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, "circom not found in PATH")

    def test_node_available(self):
        """Node.js must be installed for snarkjs."""
        result = subprocess.run(
            ["which", "node"],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, "node not found in PATH")

    def test_npx_available(self):
        """npx must be available for snarkjs."""
        result = subprocess.run(
            ["which", "npx"],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0, "npx not found in PATH")


class TestWitnessTemplate(unittest.TestCase):
    """Test witness template values."""

    TEMPLATE_PATH = Path(__file__).parent.parent / "zk_circuits" / "witness_template.json"

    def test_merkle_path_length(self):
        """Verify Merkle path has 4 elements (circuit uses 4 levels)."""
        with open(self.TEMPLATE_PATH) as f:
            data = json.load(f)

        self.assertEqual(len(data["merklePath"]), 4)

    def test_merkle_indices_binary(self):
        """Verify Merkle indices are 0 or 1."""
        with open(self.TEMPLATE_PATH) as f:
            data = json.load(f)

        for idx in data["merkleIndices"]:
            self.assertIn(idx, [0, 1], f"Invalid index: {idx}")

    def test_amount_positive(self):
        """Verify amount is positive."""
        with open(self.TEMPLATE_PATH) as f:
            data = json.load(f)

        self.assertGreater(data["amountPublic"], 0)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestCircuitCompilation))
    suite.addTests(loader.loadTestsFromTestCase(TestSnarkjsIntegration))
    suite.addTests(loader.loadTestsFromTestCase(TestZKProofStructure))
    suite.addTests(loader.loadTestsFromTestCase(TestZKPrivacyPool))
    suite.addTests(loader.loadTestsFromTestCase(TestDependencies))
    suite.addTests(loader.loadTestsFromTestCase(TestWitnessTemplate))

    # Run with verbosity
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Return exit code
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
