# Quantum Vault - Time-Lock Vault for AI Agents

A time-lock vault for AI agents on Starknet with secure fund locking and scheduled release.

## Features

- **Time-Lock**: Lock funds for a specified duration (5 min - 30 days)
- **Owner Control**: Single owner with full control
- **Secure Release**: Only owner can release after timelock expires
- **Emergency Cancel**: Owner can cancel before expiration

## Quick Start

```bash
# Install dependencies
scarb build

# Run tests
scarb test
```

## Usage

```cairo
// Deploy with time-lock
let vault = QuantumVault::deploy(
    owner: contract_address,
    min_duration: 300,    // 5 minutes
    max_duration: 2592000 // 30 days
);

// Lock funds with 1 hour timelock
vault.lockFunds(3600);

// Release after timelock expires
vault.release();
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Testing

```bash
scarb test
```

## Security

See [SECURITY.md](SECURITY.md) for security policy.

## License

MIT License - see [LICENSE](LICENSE)
