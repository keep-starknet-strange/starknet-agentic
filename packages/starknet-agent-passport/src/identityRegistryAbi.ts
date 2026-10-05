// Minimal ABI needed for IdentityRegistry metadata calls.
// Contract: contracts/erc8004-cairo/src/identity_registry.cairo
// The corelib struct entries are required: without them starknet.js encodes
// a ByteArray argument as a single felt and the contract rejects the call.

export const identityRegistryAbi = [
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "struct",
    name: "core::byte_array::ByteArray",
    members: [
      { name: "data", type: "core::array::Array::<core::bytes_31::bytes31>" },
      { name: "pending_word", type: "core::felt252" },
      { name: "pending_word_len", type: "core::internal::bounded_int::BoundedInt::<0, 30>" },
    ],
  },
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
