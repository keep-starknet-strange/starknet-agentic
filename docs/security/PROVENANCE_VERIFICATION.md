# Provenance Verification (Sigstore Keyless)

This repository uses Sigstore keyless provenance with GitHub Actions OIDC for release artifacts.

Trust model:
- No long-lived maintainer-managed signing key
- Attestations are signed by GitHub-hosted workflow identity
- Verification is anchored to GitHub's OIDC issuer and repository identity

## Canonical Verification Procedure

Set variables:

```bash
export REPO="keep-starknet-strange/starknet-agentic"
export TAG="vX.Y.Z"
export OUT_DIR="/tmp/starknet-agentic-${TAG}"
```

Download release artifacts:

```bash
mkdir -p "$OUT_DIR"
gh release download "$TAG" -R "$REPO" \
  --dir "$OUT_DIR" \
  --pattern "*.tgz" \
  --pattern "checksums.txt"
```

Verify Sigstore keyless attestations (primary trust anchor):

<!-- IMPORTANT: keep --signer-workflow in sync with the actual workflow file path/name -->

```bash
(
  set -euo pipefail
  shopt -s failglob
  for artifact in "$OUT_DIR"/*.tgz "$OUT_DIR"/checksums.txt; do
    gh attestation verify "$artifact" \
      --repo "$REPO" \
      --signer-workflow "keep-starknet-strange/starknet-agentic/.github/workflows/publish.yml" \
      --cert-oidc-issuer "https://token.actions.githubusercontent.com"
  done
)
```

Expected result: each artifact returns a successful verification tied to the repo workflow identity.

Verify checksums:

```bash
cd "$OUT_DIR"
sha256sum -c checksums.txt
```

On macOS, use:

```bash
cd "$OUT_DIR"
shasum -a 256 -c checksums.txt
```

## Staging Bundle (No npm Publish)

To generate a tagged staging bundle with attestations but without publishing to npm:

```bash
gh workflow run publish.yml \
  -R "$REPO" \
  --ref main \
  -f release_tag="staging-YYYY-MM-DD" \
  -f publish_to_npm=false
```

The workflow will:
- create a prerelease for `release_tag` if it does not already exist
- attach `*.tgz` + `checksums.txt`
- emit Sigstore keyless attestations for those assets
- skip npm publish

Then verify with the canonical procedure above by setting `TAG` to the staging tag.

## Strict Demo Artifact Verification

For strict demo artifacts checked by CI, run:

```bash
node scripts/security/verify-secure-defi-claims.mjs \
  --artifact examples/secure-defi-demo/test/fixtures/strict-claims-pass.json \
  --require-strict
```

The strict proof workflow is a policy gate only: it verifies strict claims and fails the pipeline on violation. It does not emit build provenance attestation for repository fixture files.
