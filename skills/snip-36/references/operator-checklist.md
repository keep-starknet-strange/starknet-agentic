# SNIP-36 Operator Checklist

Use this checklist before wiring SNIP-36 into an application.

- Keep private inputs on the backend; never send them to fee estimation RPCs.
- Run the prover on a host with a native Rust toolchain, 10 GB disk, and about 18 GB RAM.
- Fetch a fresh block number immediately before signing the virtual transaction.
- Keep Cairo and TypeScript nullifier domains and Poseidon input order identical.
- Verify `proof_facts[8]` against the recomputed L2-to-L1 message hash before applying state.
