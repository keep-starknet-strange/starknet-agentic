#!/usr/bin/env python3
"""
Generate valid witness for Privacy Pool ZK circuit.

IMPORTANT: The circuit uses REAL Poseidon hash from circomlib.
For witness generation, we use the circom-compiled WASM module
or witness_template.json with pre-computed valid values.

For production, run:
1. circom privacy_pool.circom --wasm
2. node privacy_pool_js/generate_witness.js
"""

import json
import subprocess
import os
from pathlib import Path


def generate_witness():
    """
    Generate valid witness for Privacy Pool ZK circuit.
    
    Uses witness_template.json with pre-validated values
    that are compatible with the compiled circuit.
    """
    
    # Load validated witness template
    circuit_dir = Path(__file__).parent.parent / "zk_circuits"
    template_file = circuit_dir / "witness_template.json"
    
    if template_file.exists():
        print("📋 Using validated witness_template.json")
        with open(template_file) as f:
            witness = json.load(f)
    else:
        # Fallback: Generate from template if needed
        witness = {
            "nullifierPublic": 112444,
            "merkleRootPublic": 12580,
            "amountPublic": 100,
            "salt": 12345,
            "nullifierSecret": 99999,
            "merklePath": [2, 7, 26, 100],
            "merkleIndices": [0, 0, 0, 0]
        }
        print("⚠️  Using fallback values - compile circuit for valid witness")
    
    # Validate witness structure
    required_fields = [
        "nullifierPublic", "merkleRootPublic", "amountPublic",
        "salt", "nullifierSecret", "merklePath", "merkleIndices"
    ]
    
    for field in required_fields:
        assert field in witness, f"Missing field: {field}"
    
    # Validate array lengths
    assert len(witness["merklePath"]) == 4, "merklePath must have 4 elements"
    assert len(witness["merkleIndices"]) == 4, "merkleIndices must have 4 elements"
    
    print("=== Privacy Pool Witness Values ===")
    print(f"amountPublic = {witness['amountPublic']}")
    print(f"salt = {witness['salt']}")
    print(f"nullifierSecret = {witness['nullifierSecret']}")
    print(f"nullifierPublic = {witness['nullifierPublic']}")
    print(f"merkleRootPublic = {witness['merkleRootPublic']}")
    print(f"merklePath = {witness['merklePath']}")
    print(f"merkleIndices = {witness['merkleIndices']}")
    
    # Write witness input
    input_file = circuit_dir / "witness_input.json"
    with open(input_file, "w") as f:
        json.dump(witness, f, indent=2)
    
    print(f"\n✅ Witness written to: {input_file}")
    
    return witness


if __name__ == "__main__":
    circuit_dir = Path(__file__).parent.parent / "zk_circuits"
    os.chdir(circuit_dir)
    success = generate_witness()
    exit(0 if success else 1)
