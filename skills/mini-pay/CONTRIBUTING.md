# Contributing to Mini-Pay

Thank you for contributing to the Starknet Mini-Pay skill!

## Development Setup

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic
cd starknet-agentic/skills/mini-pay
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your testnet credentials
```

## Running Tests

```bash
pytest
python scripts/cli.py --help
```

## Code Style
- Python 3.10+
- Type hints encouraged
- Black formatting
- Clear error messages for production use

## Pull Request Process
1. Fork and create a feature branch
2. Add tests for new features
3. Update documentation
4. Ensure `pytest` passes
5. Open PR with clear description

## Areas for Contribution
- Additional token support
- UI improvements for payment links
- Telegram bot commands
- Invoice export formats
