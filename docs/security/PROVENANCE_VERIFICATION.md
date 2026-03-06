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

Verify Sigstore keyless attestations:

```bash
for artifact in "$OUT_DIR"/*.tgz; do
  gh attestation verify "$artifact" \
    --repo "$REPO" \
    --signer-workflow "keep-starknet-strange/starknet-agentic/.github/workflows/publish.yml" \
    --cert-oidc-issuer "https://token.actions.githubusercontent.com"
done
```

Expected result: each package returns a successful verification tied to the repo workflow identity.

## Strict Demo Artifact Verification

For strict demo artifacts checked by CI, run:

```bash
node scripts/security/verify-secure-defi-claims.mjs \
  --artifact examples/secure-defi-demo/test/fixtures/strict-claims-pass.json \
  --require-strict
```

When the strict proof workflow runs on a release tag, it also emits keyless provenance attestation for the verified artifact path.
