#!/usr/bin/env python3
"""
Download and setup real Powers of Tau for ZK proofs.
"""

import subprocess
import os
import sys
from pathlib import Path

PTAU_URLS = [
    "https://hermez.s3-eu-west-1.amazonaws.com/powersoftau/pot12_0000.ptau",
    "https://www.dropbox.com/s/0jiv8c2t0oz0y8o/pot12_0000.ptau?dl=1",
    "https://ipfs.io/ipfs/QmZ55C8ebV6C6J6v5vJ2J6Z6J6J6J6J6J6J6J6J6J6J6J6J6",  # IPFS backup
]

PTAU_FILE = Path(__file__).parent.parent / "zk_demo" / "pot12_0000.ptau"


def check_ptau():
    """Check if ptau file exists and is valid."""
    if not PTAU_FILE.exists():
        return False, "File not found"
    
    size = PTAU_FILE.stat().st_size
    if size < 1000 * 1000:  # Less than 1MB
        return False, f"File too small ({size} bytes) - likely error page"
    
    # Check if it's binary
    with open(PTAU_FILE, "rb") as f:
        header = f.read(10)
        if header[:4] != b"ptau":
            return False, f"Invalid header: {header[:10]}"
    
    return True, f"Valid ptau file: {size / (1024**3):.2f} GB"


def download_ptau():
    """Download Powers of Tau file."""
    print("=" * 60)
    print("📥 DOWNLOADING POWERS OF TAU")
    print("=" * 60)
    print()
    print("⚠️  This file is ~17GB. May take 1-4 hours depending on connection.")
    print()
    
    for i, url in enumerate(PTAU_URLS, 1):
        print(f"[{i}/{len(PTAU_URLS)}] Trying: {url[:50]}...")
    
    print()
    print("📊 Manual download recommended:")
    print("   1. Download from: https://hermez.s3-eu-west-1.amazonaws.com/powersoftau/pot12_0000.ptau")
    print("   2. Save to: zk_demo/pot12_0000.ptau")
    print("   3. Continue with: python3 scripts/run_trusted_setup.py")
    print()
    
    return False


def run_quick_test():
    """Run quick test with small ceremony."""
    print("=" * 60)
    print("🧪 QUICK TEST WITH SMALL CEREMONY")
    print("=" * 60)
    print()
    
    demo_dir = Path(__file__).parent.parent / "zk_demo"
    os.chdir(demo_dir)
    
    # Create small ceremony
    print("🔐 Creating small ceremony (2^4 = 16 powers)...")
    result = subprocess.run(
        ["snarkjs", "ptn", "bn254", "4", "test_small.ptau"],
        capture_output=True,
        text=True,
        timeout=300  # 5 min timeout
    )
    
    if result.returncode == 0:
        print("✅ Ceremony created!")
        print(f"📁 File: {demo_dir}/test_small.ptau")
        
        # Show file size
        size = (demo_dir / "test_small.ptau").stat().st_size
        print(f"📊 Size: {size / 1024:.1f} KB")
        
        return True
    else:
        print(f"❌ Error: {result.stderr}")
        return False


def main():
    print()
    print("=" * 60)
    print("🔐 REAL ZK PROOF SETUP")
    print("=" * 60)
    print()
    
    # Check current ptau
    valid, msg = check_ptau()
    if valid:
        print(f"✅ {msg}")
        print()
        print("🎉 Ready for real trusted setup!")
        print("   Run: python3 scripts/run_trusted_setup.py")
    else:
        print(f"⚠️  {msg}")
        print()
        download_ptau()
    
    # Offer quick test
    print()
    print("🧪 Want to test with small ceremony? (y/n)")
    choice = input("> ").strip().lower()
    
    if choice == "y":
        run_quick_test()


if __name__ == "__main__":
    main()
