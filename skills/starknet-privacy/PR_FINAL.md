# ZK Privacy Pool - Zero-Knowledge Privacy for Starknet

## Summary

Add a zero-knowledge privacy pool skill for Starknet using ZK-SNARKs. This allows users to make private transactions by proving membership in a merkle tree without revealing which leaf they belong to.

## Motivation

Privacy is a fundamental requirement for financial applications. This feature enables:

- **Privacy-preserving deposits and withdrawals** - users can prove their funds come from the pool without revealing transaction details
- **Non-custodial privacy** - users maintain control of their assets while achieving privacy
- **Optional transparency** - users can share proof of membership when needed

## Changes

### New Files
| File | Purpose | LOC |
|------|---------|-----|
| `zk_circuits/privacy_pool.circom` | ZK circuit for merkle verification | 61 |
| `zk_circuits/privacy_pool.wasm` | Compiled circuit | - |
| `zk_circuits/witness_template.json` | Witness generation template | - |
| `scripts/zk_prover.py` | Python proof generator | 345 |
| `scripts/generate_valid_witness.py` | Witness generator | 124 |
| `tests/test_privacy_pool.py` | Test suite | 206 |
| `docs/ARCHITECTURE.md` | Architecture documentation | - |
| `LICENSE` | MIT License | - |
| `CONTRIBUTING.md` | Contributing guidelines | - |
| `SECURITY.md` | Security policy | - |

### Modified Files
None - this is a pure addition.

## Technical Details

### Architecture
```
User Deposit → Poseidon Merkle Tree → ZK Circuit → Proof → Smart Contract Verification
```

### Components
1. **ZK Circuit (Circom)**: Generates zero-knowledge proofs of merkle membership
2. **Python Prover**: Handles proof generation off-chain
3. **Witness Generator**: Creates valid witnesses for the circuit
4. **Test Suite**: Validates all edge cases

### Security Considerations
- Circuit designed to prevent double-spending
- Merkle tree uses Poseidon hash (ZK-friendly)
- No linkability between deposits and withdrawals

## Testing

```bash
# Run test suite
pytest tests/test_privacy_pool.py

# Expected: All tests pass
```

## Checklist

- [x] Linked issue (#208) explaining why this change exists
- [x] Includes acceptance test (test_privacy_pool.py)
- [x] Tests pass (`pytest`)
- [x] No unrelated refactors
- [x] Code follows conventional commits
- [x] Security best practices followed (.env.example, no secrets)
- [x] Documentation included (ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md)

## Future Development

This is an initial implementation. If there's interest from the community/starknet-agentic team, I'm happy to continue developing:

1. **On-chain verification contract** - Cairo contract to verify proofs on Starknet
2. **Batch proofs** - Support for multiple withdrawals in one transaction
3. **Anonymous voting** - Privacy-preserving governance
4. **Shielded pools** - Integration with DeFi protocols
5. **Formal verification** - Prove circuit security mathematically

## Related Issues

- Closes #208

## Notes for Reviewers

This is an **experimental feature** focused on privacy infrastructure. The code is production-ready in terms of structure and documentation, but the ZK circuit should undergo security audit before mainnet deployment.

Key areas for feedback:
1. Circuit efficiency (can we reduce constraints?)
2. Integration patterns with existing starknet-agentic skills
3. Whether to include on-chain verification in-scope for this PR

---

*Submitted by: Gaijin-01*
*Status: Ready for review*
