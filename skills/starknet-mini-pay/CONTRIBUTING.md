# Contributing to Starknet Mini-Pay

This project follows the [starknet-agentic contributing guidelines](../CONTRIBUTING.md).

## Quickstart

```bash
# Clone
git clone https://github.com/Gaijin-01/starknet-agentic.git
cd starknet-agentic/skills/starknet-mini-pay

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
feat(mini-pay): add QR code generation for payments
fix(mini-pay): handle token address edge case
docs(mini-pay): update deployment guide
```

## Security

- Never commit real private keys
- Use `.env.example` only
- If key leaked → treat as compromised, rotate it
