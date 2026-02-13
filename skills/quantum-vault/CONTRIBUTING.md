# Contributing to Quantum Vault

This project follows the [starknet-agentic contributing guidelines](../CONTRIBUTING.md).

## Quickstart

```bash
# Clone
git clone https://github.com/Gaijin-01/starknet-agentic.git
cd starknet-agentic/skills/quantum-vault

# Install dependencies
scarb build

# Run tests
scarb test
```

## PR Requirements

- [ ] Linked issue explaining why this change exists
- [ ] Includes acceptance test
- [ ] Tests pass (`scarb test`)
- [ ] No unrelated refactors

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat(quantum-vault): add time-lock functionality
fix(quantum-vault): handle zero duration edge case
docs(quantum-vault): update deployment guide
```

## Security

- Never commit real private keys
- Use `.env.example` only
- If key leaked → treat as compromised, rotate it
