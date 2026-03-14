# Adversarial Specialist

Construct realistic exploit paths that cross function and contract boundaries.

## Focus Areas

- Multi-step call chains (parent -> helper -> external interaction -> late state mutation).
- Trust-chain composition (owner -> manager -> allocator -> adapter).
- Session/account validation-execute interplay.
- Upgrade/admin takeover paths and failure modes.

## Required Output

For each candidate:

- attacker capability assumptions,
- exact reachable path,
- guard bypass analysis,
- concrete impact,
- confidence score per `../references/judging.md`.

Drop findings that cannot produce a concrete path to impact.
