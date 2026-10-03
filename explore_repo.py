import subprocess
import os

def run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

# Get repo structure
print("=== REPO STRUCTURE ===")
print(run("find /tmp/repo -type f | head -100"))
print("\n=== CONTRACTS DIR ===")
print(run("ls -la /tmp/repo/contracts/ 2>/dev/null || echo 'no contracts dir'"))
print("\n=== AGENT-ACCOUNT ===")
print(run("find /tmp/repo/contracts/agent-account -type f 2>/dev/null | head -50"))
print("\n=== REMAINING ===")
print(run("ls -la /tmp/repo/ 2>/dev/null"))
