#!/usr/bin/env python3
"""
Generate valid witness for Privacy Pool ZK circuit.
"""

import json
import subprocess
import os
from pathlib import Path


def compute_poseidon(a, b):
    """Simple additive hash matching circuit behavior."""
    return a + b


def generate_witness():
    """Generate valid witness with consistent values."""
    
    # Parameters
    amount = 100
    salt = 12345
    nullifier_secret = 99999
    
    # Step 1: commitment = H(amount, salt)
    commitment = compute_poseidon(amount, salt)
    
    # Step 2: nullifier = H(commitment, nullifier_secret)
    nullifier = compute_poseidon(commitment, nullifier_secret)
    
    # Step 3: Merkle tree (simple 4 levels)
    # Leaves: [commitment, 2, 3, 4, 5, 6, 7, 8]
    # Level 1: [commitment+2, 3+4, 5+6, 7+8]
    # Level 2: [(commitment+2)+(3+4), (5+6)+(7+8)]
    # Level 3: [((commitment+2)+(3+4))+((5+6)+(7+8))]
    # Root = (((c+2)+3+4)+5+6+7+8) = commitment + 2 + 3 + 4 + 5 + 6 + 7 + 8 = commitment + 35
    
    sibling0 = 2
    sibling1 = 7   # (3+4)
    sibling2 = 26   # (5+6+7+8)
    sibling3 = 100  # filler
    
    # Compute root
    root = compute_poseidon(
        compute_poseidon(
            compute_poseidon(
                compute_poseidon(commitment, sibling0),
                sibling1
            ),
            sibling2
        ),
        sibling3
    )
    
    print("=== Privacy Pool Values ===")
    print(f"amount = {amount}")
    print(f"salt = {salt}")
    print(f"nullifier_secret = {nullifier_secret}")
    print(f"commitment = H({amount}, {salt}) = {commitment}")
    print(f"nullifier = H({commitment}, {nullifier_secret}) = {nullifier}")
    print(f"merklePath = [{sibling0}, {sibling1}, {sibling2}, {sibling3}]")
    print(f"merkleRoot = {root}")
    
    # Build witness input
    witness = {
        "nullifierPublic": nullifier,
        "merkleRootPublic": root,
        "amountPublic": amount,
        "salt": salt,
        "nullifierSecret": nullifier_secret,
        "merklePath": [sibling0, sibling1, sibling2, sibling3],
        "merkleIndices": [0, 0, 0, 0]
    }
    
    # Write input
    circuit_dir = Path(__file__).parent.parent / "zk_circuits"
    input_file = circuit_dir / "witness_valid.json"
    circuit_dir.mkdir(exist_ok=True)
    with open(input_file, "w") as f:
        json.dump(witness, f, indent=2)
    
    print(f"\n=== Generating Proof ===")
    
    # Generate proof
    result = subprocess.run(
        ["snarkjs", "g16f",
         str(input_file),
         str(circuit_dir / "privacy_pool.wasm"),
         str(circuit_dir / "circuit_final.zkey"),
         str(circuit_dir / "proof_valid.json"),
         str(circuit_dir / "public_valid.json")],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ Failed: {result.stderr}")
        return False
    
    print("✅ Proof generated")
    
    # Verify
    result = subprocess.run(
        ["snarkjs", "g16v",
         str(circuit_dir / "verification_key.json"),
         str(circuit_dir / "public_valid.json"),
         str(circuit_dir / "proof_valid.json")],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("✅✅✅ PROOF VERIFIED! ✅✅✅")
        return True
    else:
        print(f"❌ Verification failed: {result.stderr}")
        return False


if __name__ == "__main__":
    circuit_dir = Path(__file__).parent.parent / "zk_circuits"
    os.chdir(circuit_dir)
    success = generate_witness()
    exit(0 if success else 1)
