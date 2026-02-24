# Changelog

All notable changes to this repository are documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
follows SemVer with a pre-1.0 policy (see [`VERSIONING.md`](./VERSIONING.md)).

## [Unreleased]

### Security

- Root `pnpm.overrides` reviewed and approved:
  - `minimatch`: `^10.2.1` — fixes ReDoS
    ([GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26));
    transitive via eslint (devDependency, build-time only)
  - `qs`: `6.14.2` — existing security pin (unchanged)  
  PR: `#289`

## [0.1.0] - 2026-02-14

### Security

- Hardened MCP tool input and execution safety:
  - reject negative amounts
  - redact internal errors from agent-facing responses
  - enforce calldata length bounds
  - cap token cache growth
  - tighten slippage defaults
  - improve retry handling for session-key register/revoke flows  
  PR: `#237`  
  Merge commit: `5ccd005b0b78eb5431850579add31f823183a249`
- Added CI audit allowlist gate for dependency vulnerabilities and fail-closed
  behavior when audit output contains errors.  
  PR: `#238`  
  Merge commit: `732635fb7f05819b09defba874526e442dd735e2`
- Pinned `qs` override exactly to `6.14.2` in security hardening flow.

### Changed

- Replaced ad-hoc `console.*` calls with structured JSON logging to `stderr`
  (stdout preserved for MCP stdio transport), plus logger hardening for
  `BigInt`/circular payloads.  
  PR: `#239`  
  Merge commit: `d913d065eb7ee30209f39ca9486df9c12f780f5b`

[Unreleased]: https://github.com/keep-starknet-strange/starknet-agentic/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/keep-starknet-strange/starknet-agentic/releases/tag/v0.1.0
