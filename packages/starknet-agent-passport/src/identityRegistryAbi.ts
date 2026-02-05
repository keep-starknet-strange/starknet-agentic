// Minimal ABI needed for IdentityRegistry metadata calls.
// Contract: packages/starknet-identity/erc8004-cairo/src/identity_registry.cairo

export const identityRegistryAbi = [
  {
    type: "function",
    name: "set_metadata",
    inputs: [
      { name: "agent_id", type: "core::integer::u256" },
      { name: "key", type: "core::byte_array::ByteArray" },
      { name: "value", type: "core::byte_array::ByteArray" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "get_metadata",
    inputs: [
      { name: "agent_id", type: "core::integer::u256" },
      { name: "key", type: "core::byte_array::ByteArray" },
    ],
    outputs: [{ type: "core::byte_array::ByteArray" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "agent_exists",
    inputs: [{ name: "agent_id", type: "core::integer::u256" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
] as const
