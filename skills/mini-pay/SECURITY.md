# Security Policy

## Reporting Vulnerabilities
Please report security issues privately to the maintainers. Do not open public issues for sensitive vulnerabilities.

## Security Best Practices

### Private Keys
- Never commit `.env` or private keys
- Use environment variables only
- Rotate keys immediately if exposed
- Testnet keys only for development

### Transactions
- All transfers are signed locally with starknet-py
- No Cairo contracts are deployed by this skill
- Validate recipient addresses before sending
- Confirm network and token addresses

### Telegram Bot
- Keep `TELEGRAM_BOT_TOKEN` secret
- Restrict bot commands to authorized chats
- Do not log messages containing amounts or addresses

### Dependencies
- Pin versions in `requirements.txt`
- Regularly update starknet-py and dependencies
- Run `pip-audit` before releases

## Scope
This skill handles funds. Any bug in signing or address handling can lead to loss of funds. Test thoroughly on testnet first.
