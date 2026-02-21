# Contributing to Privacy Pool

This project follows the [starknet-agentic contributing guidelines](../CONTRIBUTING.md).

## Quickstart

```bash
# Clone
git clone https://github.com/Gaijin-01/starknet-agentic.git
cd starknet-agentic/privacy-pool

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest
```

## PR Requirements

- [ ] Linked issue explaining why this change exists
- [ ] Includes acceptance test
- [ ] Tests pass
- [ ] No unrelated refactors

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat(privacy): add ZK circuit for merkle verification
fix(privacy): handle zero balance edge case
docs(privacy): update deployment guide
```

## Security

- Never commit real private keys
- Use `.env.example` only
- If key leaked → treat as compromised, rotate it
