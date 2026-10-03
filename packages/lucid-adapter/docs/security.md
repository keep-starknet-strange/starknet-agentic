# Security & Trust Boundaries

## Trust split
* Owner: holds master key, approves session derivation via SNIP-12
* Session operational wallet: holds limited spend authority for STRK payments, short-lived

## Signer mode
Session key signs payment calls only. Owner never signs per-request.

## Replay assumptions
RequestId + nonce enforced by proxy auth + replay protection #219. Adapter must not reuse requestId.

## Boundaries
Adapter does not replace signer proxy. Contract interfaces unchanged.
