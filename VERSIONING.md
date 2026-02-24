# Versioning Policy

This repository uses SemVer with a pre-1.0 production policy.

## Current stage
- Current baseline: `0.1.0`
- Stability target before `1.0.0`: tighten API guarantees and release discipline across contracts, MCP tooling, and skills.

## Pre-1.0 bump rules (`0.y.z`)
- `PATCH` (`0.y.z+1`):
  - security fixes
  - bug fixes
  - internal refactors without external behavior changes
  - docs/CI changes
- `MINOR` (`0.y+1.0`):
  - any externally visible behavior change
  - new features that alter expected outputs or workflows
  - any breaking change to:
    - MCP tool request/response schema
    - environment variable contract
    - contract interfaces relied on by examples/SDK consumers

## `1.0.0` readiness criteria
- Stable, documented public contracts for:
  - MCP input/output schemas
  - env var and startup guard behavior
  - contract interfaces used by supported examples
- Security gates enforced in CI (secrets + dependency policy).
- Changelog discipline established across at least two minor releases.

## Release process
1. Update `CHANGELOG.md` under `Unreleased`.
2. Choose next version using rules above.
3. Move release notes from `Unreleased` to a new version heading with date.
4. Tag release commit with `v0.y.z` (annotated tag).
5. Publish release notes from `CHANGELOG.md`.

