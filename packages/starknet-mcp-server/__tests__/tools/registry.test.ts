import { describe, it, expect } from "vitest";
import { TOOL_MODULES, getToolHandler, listTools } from "../../src/tools/index.js";
import type { ToolContext } from "../../src/tools/index.js";

function ctx(overrides: {
  signerMode?: "direct" | "proxy";
  env?: Partial<ToolContext["env"]>;
} = {}): ToolContext {
  return {
    signerMode: overrides.signerMode ?? "direct",
    env: {
      STARKNET_RPC_URL: "http://127.0.0.1:9",
      STARKNET_ACCOUNT_ADDRESS: "0x1",
      ...overrides.env,
    },
  } as unknown as ToolContext;
}

const FULL_ENV = {
  AGENT_ACCOUNT_FACTORY_ADDRESS: "0xfac",
  ERC8004_IDENTITY_REGISTRY_ADDRESS: "0x1d",
};

// tools/list order is part of the server's observable behaviour.
const EXPECTED_ORDER = [
  "starknet_get_balance",
  "starknet_get_balances",
  "starknet_transfer",
  "starknet_call_contract",
  "starknet_invoke_contract",
  "starknet_swap",
  "starknet_get_quote",
  "starknet_estimate_fee",
  "starknet_vesu_deposit",
  "starknet_vesu_withdraw",
  "starknet_vesu_positions",
  "starknet_build_calls",
  "x402_starknet_sign_payment_required",
  "starknet_register_session_key",
  "starknet_revoke_session_key",
  "starknet_get_session_data",
  "starknet_build_transfer_calls",
  "starknet_build_swap_calls",
  "starknet_deploy_agent_account",
  "starknet_register_agent",
  "starknet_set_agent_metadata",
  "starknet_get_agent_metadata",
];

describe("tool registry", () => {
  it("has unique tool names", () => {
    const names = TOOL_MODULES.map((t) => t.definition.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool an object input schema and a handler", () => {
    for (const tool of TOOL_MODULES) {
      expect(tool.definition.inputSchema.type).toBe("object");
      expect(typeof tool.handler).toBe("function");
    }
  });

  it("lists all tools in registry order when fully configured", () => {
    const names = listTools(ctx({ env: FULL_ENV })).map((t) => t.name);
    expect(names).toEqual(EXPECTED_ORDER);
  });

  it("hides optional tools when their configuration is missing", () => {
    const names = listTools(ctx()).map((t) => t.name);
    expect(names).not.toContain("starknet_deploy_agent_account");
    expect(names).not.toContain("starknet_register_agent");
    expect(names).not.toContain("starknet_set_agent_metadata");
    expect(names).not.toContain("starknet_get_agent_metadata");
    expect(names).toHaveLength(18);
  });

  it("hides the x402 signing tool in proxy signer mode", () => {
    const names = listTools(ctx({ signerMode: "proxy", env: FULL_ENV })).map((t) => t.name);
    expect(names).not.toContain("x402_starknet_sign_payment_required");
    expect(names).toHaveLength(21);
  });

  it("keeps unlisted tools dispatchable so they can report config errors", () => {
    expect(getToolHandler("starknet_deploy_agent_account")).toBeTypeOf("function");
    expect(getToolHandler("x402_starknet_sign_payment_required")).toBeTypeOf("function");
  });

  it("returns undefined for unknown names, including Object.prototype keys", () => {
    expect(getToolHandler("unknown_tool")).toBeUndefined();
    expect(getToolHandler("constructor")).toBeUndefined();
    expect(getToolHandler("__proto__")).toBeUndefined();
  });
});
