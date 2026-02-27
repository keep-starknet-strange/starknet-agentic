#!/usr/bin/env python3
"""
ZK Privacy Pool - Proof Generator

Generates ZK proofs for privacy pool transactions using snarkjs.

Requires:
- circom (for circuit compilation)
- snarkjs (for proof generation)
- Node.js 18+
"""

import json
import hashlib
import subprocess
import os
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict
from pathlib import Path


@dataclass
class ZKProof:
    """Zero-knowledge proof data."""
    pi_a: Tuple[int, int]  # G1 point A
    pi_b: Tuple[Tuple[int, int], Tuple[int, int]]  # G2 point B
    pi_c: Tuple[int, int]  # G1 point C
    public_inputs: List[int]


@dataclass
class Commitment:
    """Privacy pool commitment."""
    amount: int
    salt: int
    commitment: int
    nullifier: int


class ZKPrivacyPool:
    """
    Zero-knowledge privacy pool proof generator.
    
    Uses snarkjs for Groth16 proof generation.
    """
    
    def __init__(self, circuit_dir: str = None):
        self.circuit_dir = Path(circuit_dir) if circuit_dir else Path(__file__).parent.parent / "zk_circuits"
        self.proving_key = None
        self.verification_key = None
    
    def check_dependencies(self) -> bool:
        """Check if required tools are installed."""
        try:
            subprocess.run(["circom", "--version"], capture_output=True, check=True)
            subprocess.run(["npx", "snarkjs", "--version"], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def compile_circuit(self, circuit_name: str = "privacy_pool") -> bool:
        """
        Compile Circom circuit to R1CS and WASM.
        
        Args:
            circuit_name: Name of the circuit file (without .circom extension)
        
        Returns:
            True if compilation successful
        """
        circuit_file = self.circuit_dir / f"{circuit_name}.circom"
        
        if not circuit_file.exists():
            raise FileNotFoundError(f"Circuit not found: {circuit_file}")
        
        print(f"🔨 Compiling circuit: {circuit_file}")
        
        # Run circom compilation
        result = subprocess.run(
            ["circom", str(circuit_file), "--r1cs", "--wasm", "--json", "-o", str(self.circuit_dir)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Compilation failed: {result.stderr}")
            return False
        
        print(f"✅ Circuit compiled: {self.circuit_dir / f'{circuit_name}.r1cs'}")
        return True
    
    def trusted_setup(self, circuit_name: str = "privacy_pool") -> Tuple[str, str]:
        """
        Run trusted setup for Groth16.
        
        Args:
            circuit_name: Name of the circuit
        
        Returns:
            Tuple of (proving_key_path, verification_key_path)
        """
        r1cs_file = self.circuit_dir / f"{circuit_name}.r1cs"
        
        if not r1cs_file.exists():
            raise FileNotFoundError(f"R1CS not found. Run compile_circuit() first.")
        
        proving_key = self.circuit_dir / "proving.key"
        verification_key = self.circuit_dir / "verification.key"
        
        print("🔐 Running trusted setup (Groth16)...")
        
        # Groth16 setup
        result = subprocess.run(
            ["snarkjs", "groth16", "setup", str(r1cs_file), "-p", str(proving_key), "-v", str(verification_key)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Setup failed: {result.stderr}")
            raise RuntimeError("Trusted setup failed")
        
        print(f"✅ Setup complete: proving.key, verification.key")
        
        return str(proving_key), str(verification_key)
    
    def generate_witness(
        self,
        input_data: Dict,
        circuit_name: str = "privacy_pool"
    ) -> str:
        """
        Generate witness file from input data.
        
        Args:
            input_data: Circuit input as dictionary
            circuit_name: Name of the circuit
        
        Returns:
            Path to witness file (.wtns)
        """
        wasm_dir = self.circuit_dir / f"{circuit_name}_js"
        input_file = self.circuit_dir / "witness_input.json"
        witness_file = self.circuit_dir / "witness.wtns"
        
        # Write input JSON
        with open(input_file, "w") as f:
            json.dump(input_data, f, indent=2)
        
        print("📝 Generating witness...")
        
        # Generate witness
        result = subprocess.run(
            ["node", str(wasm_dir / "generate_witness.js"), str(input_file), str(witness_file)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Witness generation failed: {result.stderr}")
            raise RuntimeError("Witness generation failed")
        
        print(f"✅ Witness generated: {witness_file}")
        return str(witness_file)
    
    def generate_proof(
        self,
        witness_file: str,
        proving_key: str = None,
        circuit_name: str = "privacy_pool"
    ) -> ZKProof:
        """
        Generate Groth16 proof.
        
        Args:
            witness_file: Path to witness file
            proving_key: Path to proving key
            circuit_name: Name of the circuit
        
        Returns:
            ZKProof object
        """
        pk = proving_key or str(self.circuit_dir / "proving.key")
        proof_file = self.circuit_dir / "proof.json"
        public_file = self.circuit_dir / "public.json"
        
        if not os.path.exists(pk):
            raise FileNotFoundError(f"Proving key not found: {pk}")
        
        print("🔐 Generating proof...")
        
        result = subprocess.run(
            ["snarkjs", "groth16", "prove", pk, witness_file, str(proof_file), str(public_file)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Proof generation failed: {result.stderr}")
            raise RuntimeError("Proof generation failed")
        
        # Parse proof
        with open(proof_file) as f:
            proof_data = json.load(f)
        
        proof = ZKProof(
            pi_a=tuple(proof_data["pi_a"]),
            pi_b=(tuple(proof_data["pi_b"][0]), tuple(proof_data["pi_b"][1])),
            pi_c=tuple(proof_data["pi_c"]),
            public_inputs=[]
        )
        
        # Parse public inputs
        with open(public_file) as f:
            public_data = json.load(f)
            if isinstance(public_data, list):
                proof.public_inputs = public_data
        
        print(f"✅ Proof generated: {proof_file}")
        return proof
    
    def verify_proof(self, proof: ZKProof, verification_key: str = None) -> bool:
        """
        Verify a Groth16 proof.
        
        Args:
            proof: ZKProof object
            verification_key: Path to verification key
        
        Returns:
            True if proof is valid
        """
        vk = verification_key or str(self.circuit_dir / "verification.key")
        proof_file = self.circuit_dir / "verify_proof.json"
        public_file = self.circuit_dir / "verify_public.json"
        
        if not os.path.exists(vk):
            raise FileNotFoundError(f"Verification key not found: {vk}")
        
        # Write proof and public inputs
        proof_data = {
            "pi_a": list(proof.pi_a),
            "pi_b": [list(proof.pi_b[0]), list(proof.pi_b[1])],
            "pi_c": list(proof.pi_c)
        }
        
        with open(proof_file, "w") as f:
            json.dump(proof_data, f)
        
        with open(public_file, "w") as f:
            json.dump(proof.public_inputs, f)
        
        print("🔍 Verifying proof...")
        
        result = subprocess.run(
            ["snarkjs", "groth16", "verify", vk, str(proof_file), str(public_file)],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✅ Proof verified!")
            return True
        else:
            print(f"❌ Verification failed: {result.stderr}")
            return False
    
    def export_calldata(self, proof: ZKProof) -> List[int]:
        """
        Export proof as Starknet contract call data.
        
        Args:
            proof: ZKProof object
        
        Returns:
            List of integers for contract call
        """
        # Groth16 calldata format for Starknet:
        # [pi_a[0], pi_a[1], pi_b[0][0], pi_b[0][1], pi_b[1][0], pi_b[1][1], pi_c[0], pi_c[1], ...public_inputs]
        
        calldata = [
            proof.pi_a[0], proof.pi_a[1],
            proof.pi_b[0][0], proof.pi_b[0][1],
            proof.pi_b[1][0], proof.pi_b[1][1],
            proof.pi_c[0], proof.pi_c[1]
        ]
        calldata.extend(proof.public_inputs)
        
        return calldata


async def main():
    """Demo of ZK privacy pool proof generation."""
    
    print("=" * 60)
    print("🔐 ZK Privacy Pool - Proof Generator")
    print("=" * 60)
    
    pool = ZKPrivacyPool()
    
    # Check dependencies
    if not pool.check_dependencies():
        print("❌ Dependencies not installed:")
        print("   Install: npm install -g circom snarkjs")
        print()
        print("📚 Alternative: Use mock mode for testing")
        return
    
    # Compile circuit
    pool.compile_circuit()
    
    # Trusted setup
    pool.trusted_setup()
    
    # Generate witness (example input)
    input_data = {
        "nullifierPublic": 1234567890,
        "merkleRootPublic": 9876543210,
        "amountPublic": 100,
        "salt": 1111111111,
        "nullifierSecret": 2222222222,
        "merklePath": [1111111111, 2222222222, 3333333333, 4444444444],
        "merkleIndices": [0, 0, 0, 1]
    }
    
    witness = pool.generate_witness(input_data)
    
    # Generate proof
    proof = pool.generate_proof(witness)
    
    # Verify proof
    valid = pool.verify_proof(proof)
    
    # Export calldata
    calldata = pool.export_calldata(proof)
    print(f"📤 Calldata length: {len(calldata)}")
    
    print("\n" + "=" * 60)
    print("🎉 ZK Privacy Pool Demo Complete")
    print("=" * 60)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
