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


class TestIntegrationProofGeneration(unittest.TestCase):
    """
    Integration tests for ZK proof generation.
    
    These tests actually compile the circuit and generate/verify proofs.
    """

    CIRCUIT_DIR = Path(__file__).parent.parent / "zk_circuits"
    SKIP_REASON = "Integration tests require circom + snarkjs + full node_modules"

    @unittest.skipUnless(
        subprocess.run(["which", "circom"], capture_output=True).returncode == 0,
        "circom not installed"
    )
    def test_circuit_compiles_successfully(self):
        """Verify circuit compiles to R1CS and WASM."""
        circuit_file = self.CIRCUIT_DIR / "privacy_pool.circom"
        r1cs_file = self.CIRCUIT_DIR / "privacy_pool.r1cs"
        wasm_dir = self.CIRCUIT_DIR / "privacy_pool_js"

        if r1cs_file.exists():
            r1cs_file.unlink()
        import shutil
        if wasm_dir.exists():
            shutil.rmtree(wasm_dir)

        result = subprocess.run(
            ["circom", str(circuit_file), "--r1cs", "--wasm", "--json", "-o", str(self.CIRCUIT_DIR)],
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, f"Circom failed: {result.stderr}")
        self.assertTrue(r1cs_file.exists(), "R1CS not generated")
        self.assertTrue(wasm_dir.exists(), "WASM not generated")

    @unittest.skipUnless(
        subprocess.run(["which", "npx"], capture_output=True).returncode == 0,
        "npx/snarkjs not installed"
    )
    def test_trusted_setup_runs(self):
        """Verify trusted setup generates keys."""
        r1cs_file = self.CIRCUIT_DIR / "privacy_pool.r1cs"
        proving_key = self.CIRCUIT_DIR / "proving.key"
        verification_key = self.CIRCUIT_DIR / "verification.key"

        if not r1cs_file.exists():
            self.skipTest("R1CS not found - run test_circuit_compiles_successfully first")

        for key in [proving_key, verification_key]:
            if key.exists():
                key.unlink()

        result = subprocess.run(
            ["snarkjs", "groth16", "setup", str(r1cs_file), "-p", str(proving_key), "-v", str(verification_key)],
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, f"Setup failed: {result.stderr}")
        self.assertTrue(proving_key.exists(), "Proving key not generated")
        self.assertTrue(verification_key.exists(), "Verification key not generated")

    @unittest.skipUnless(
        subprocess.run(["which", "node"], capture_output=True).returncode == 0,
        "node not installed"
    )
    def test_witness_generation(self):
        """Verify witness generates from valid inputs."""
        wasm_dir = self.CIRCUIT_DIR / "privacy_pool_js"
        witness_file = self.CIRCUIT_DIR / "test_witness.wtns"
        input_file = self.CIRCUIT_DIR / "test_input.json"

        if not wasm_dir.exists():
            self.skipTest("WASM not found - run circuit compilation first")

        input_data = {
            "nullifierPublic": 1234567890,
            "merkleRootPublic": 9876543210,
            "amountPublic": 100,
            "salt": 1111111111,
            "nullifierSecret": 2222222222,
            "merklePath": [1111111111] * 32,
            "merkleIndices": [0] * 32
        }

        with open(input_file, "w") as f:
            json.dump(input_data, f)

        result = subprocess.run(
            ["node", str(wasm_dir / "generate_witness.js"), str(input_file), str(witness_file)],
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, f"Witness failed: {result.stderr}")
        self.assertTrue(witness_file.exists(), "Witness not generated")

    @unittest.skipUnless(
        subprocess.run(["which", "npx"], capture_output=True).returncode == 0,
        "npx/snarkjs not installed"
    )
    def test_proof_generation(self):
        """Verify proof generates from witness."""
        proving_key = self.CIRCUIT_DIR / "proving.key"
        witness_file = self.CIRCUIT_DIR / "test_witness.wtns"
        proof_file = self.CIRCUIT_DIR / "test_proof.json"
        public_file = self.CIRCUIT_DIR / "test_public.json"

        if not proving_key.exists():
            self.skipTest("Proving key not found - run trusted setup first")
        if not witness_file.exists():
            self.skipTest("Witness not found - run witness generation first")

        result = subprocess.run(
            ["snarkjs", "groth16", "prove", str(proving_key), str(witness_file), str(proof_file), str(public_file)],
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, f"Proof failed: {result.stderr}")
        self.assertTrue(proof_file.exists(), "Proof not generated")
        self.assertTrue(public_file.exists(), "Public inputs not generated")

    @unittest.skipUnless(
        subprocess.run(["which", "npx"], capture_output=True).returncode == 0,
        "npx/snarkjs not installed"
    )
    def test_proof_verification_valid(self):
        """Verify proof passes with valid inputs."""
        verification_key = self.CIRCUIT_DIR / "verification.key"
        proof_file = self.CIRCUIT_DIR / "test_proof.json"
        public_file = self.CIRCUIT_DIR / "test_public.json"

        if not verification_key.exists():
            self.skipTest("Verification key not found - run trusted setup first")
        if not proof_file.exists():
            self.skipTest("Proof not found - run proof generation first")

        result = subprocess.run(
            ["snarkjs", "groth16", "verify", str(verification_key), str(proof_file), str(public_file)],
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, f"Valid proof rejected: {result.stderr}")

    @unittest.skipUnless(
        subprocess.run(["which", "npx"], capture_output=True).returncode == 0,
        "npx/snarkjs not installed"
    )
    def test_proof_verification_invalid_fails(self):
        """Verify proof fails verification with wrong inputs."""
        verification_key = self.CIRCUIT_DIR / "verification.key"
        proof_file = self.CIRCUIT_DIR / "test_proof.json"
        public_file = self.CIRCUIT_DIR / "test_wrong_public.json"

        if not verification_key.exists():
            self.skipTest("Verification key not found - run trusted setup first")
        if not proof_file.exists():
            self.skipTest("Proof not found - run proof generation first")

        wrong_public = [9999999999, 8888888888, 999]  # Wrong values

        with open(public_file, "w") as f:
            json.dump(wrong_public, f)

        result = subprocess.run(
            ["snarkjs", "groth16", "verify", str(verification_key), str(proof_file), str(public_file)],
            capture_output=True,
            text=True
        )

        self.assertNotEqual(result.returncode, 0, "Invalid proof was accepted!")


def cleanup_test_files():
    """Clean up test-generated files."""
    circuit_dir = Path(__file__).parent.parent / "zk_circuits"

    test_files = [
        "privacy_pool.r1cs",
        "privacy_pool_js",
        "proving.key",
        "verification.key",
        "test_input.json",
        "test_witness.wtns",
        "test_proof.json",
        "test_public.json",
        "test_wrong_public.json",
    ]

    for filename in test_files:
        path = circuit_dir / filename
        if path.exists():
            if path.is_dir():
                import shutil
                shutil.rmtree(path)
            else:
                path.unlink()


class TestCleanup(unittest.TestCase):
    """Clean up test artifacts."""

    def test_cleanup_test_files(self):
        """Remove test-generated files."""
        cleanup_test_files()
        self.assertTrue(True)


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
