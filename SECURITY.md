# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately.

- Prefer GitHub Private Vulnerability Reporting in this repository.
- If private reporting is not available, open a security issue without exploit details and ask for a private channel.

Please include:

- affected package/path
- impact and attack scenario
- reproduction steps
- suggested mitigation (if available)

## Disclosure Process

- We will acknowledge receipt as soon as possible.
- We will triage severity and scope, then prepare a fix.
- We will coordinate disclosure timing with the reporter.

## Scope

This policy covers the whole repository, including:

- contracts under `contracts/`
- protocol/spec files under `spec/` and `docs/`
- workflows under `.github/workflows/`
- published packages under `packages/`

## Supported Versions

This repository is pre-1.0.

- Security fixes are applied to `main`.
- Critical fixes may be backported to recent release branches when they exist.
