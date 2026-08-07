# @starknetfoundation/create-starknet-agent

## 1.0.0

### Major Changes

- 7ae86c2: Raise the supported Node.js floor to `>=24.0.0`.

  The repository toolchain (CI, `.nvmrc`, and the root/website `engines` fields)
  has moved to Node 24, and the CLI now declares the same floor. This is a
  breaking change for anyone scaffolding on Node 18, 20, or 22 — upgrade to Node
  24 before running `create-starknet-agent`.
