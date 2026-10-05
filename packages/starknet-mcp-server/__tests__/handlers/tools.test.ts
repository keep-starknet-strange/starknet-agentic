import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Token addresses
const TOKENS = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// Mock environment variables before any imports
const mockEnv = {
  STARKNET_RPC_URL: "https://starknet-sepolia.example.com",
  STARKNET_ACCOUNT_ADDRESS: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  STARKNET_SIGNER_MODE: "direct",
  // Non-secret placeholder; tests only require a syntactically-valid string.
  STARKNET_PRIVATE_KEY: "0x1",
  KEYRING_PROXY_URL: "http://127.0.0.1:8545",
  KEYRING_HMAC_SECRET: "test-hmac-secret",
  KEYRING_CLIENT_ID: "mcp-test-suite",
  AVNU_BASE_URL: "https://sepolia.api.avnu.fi",
  AVNU_PAYMASTER_URL: "https://sepolia.paymaster.avnu.fi",
  ERC8004_IDENTITY_REGISTRY_ADDRESS:
    "0x1111111111111111111111111111111111111111111111111111111111111111",
};

// Mock starknet before importing the module
const mockExecute = vi.fn();
const mockEstimateInvokeFee = vi.fn();
const mockEstimatePaymasterTransactionFee = vi.fn();
const mockExecutePaymasterTransaction = vi.fn();
const mockWaitForTransaction = vi.fn();
const mockCallContract = vi.fn();
const mockGetChainId = vi.fn(async () => "0x534e5f5345504f4c4941");
const mockBalanceOf = vi.fn();
const mockAccountConstructor = vi.fn().mockImplementation(function MockAccount() {
  return {
  address: mockEnv.STARKNET_ACCOUNT_ADDRESS,
  execute: mockExecute,
  estimateInvokeFee: mockEstimateInvokeFee,
  estimatePaymasterTransactionFee: mockEstimatePaymasterTransactionFee,
  executePaymasterTransaction: mockExecutePaymasterTransaction,
  };
});
const mockValidateAndParseAddress = vi.fn((addr: string) =>
  addr.toLowerCase().padStart(66, "0x".padEnd(66, "0"))
);

vi.mock("starknet", () => ({
  Account: mockAccountConstructor,
  RpcProvider: vi.fn().mockImplementation(function MockRpcProvider() {
    return {
      callContract: mockCallContract,
      waitForTransaction: mockWaitForTransaction,
      getChainId: mockGetChainId,
    };
  }),
  PaymasterRpc: vi.fn().mockImplementation(function MockPaymasterRpc(opts) {
    return opts || {};
  }),
  Contract: vi.fn().mockImplementation(function MockContract() {
    return {
      balanceOf: mockBalanceOf,
      get_balances: vi.fn(),
    };
  }),
  CallData: {
    compile: vi.fn((data) => Object.values(data)),
  },
  cairo: {
    uint256: vi.fn((n) => ({ low: n.toString(), high: "0" })),
  },
  num: {
    toHex: vi.fn((value) => {
      if (typeof value === "string" && value.startsWith("0x")) {
        return value;
      }
      return `0x${BigInt(value).toString(16)}`;
    }),
  },
  SignerInterface: class {},
  ETransactionVersion: {
    V3: "0x3",
  },
  validateAndParseAddress: mockValidateAndParseAddress,
  uint256: {
    uint256ToBN: vi.fn((val) => {
      if (typeof val === "bigint") return val;
      return BigInt(val.low) + (BigInt(val.high) << 128n);
    }),
  },
  byteArray: {
    byteArrayFromString: vi.fn((v: string) => ({
      data: [`encoded:${v}`],
      pending_word: "0x0",
      pending_word_len: 0,
    })),
    stringFromByteArray: vi.fn(() => "TEST"),
  },
  // Minimal selector helper used by receipt parsers.
  hash: {
    getSelectorFromName: vi.fn((name: string) => `selector:${name}`),
  },
}));

// Mock avnu-sdk
const mockGetQuotes = vi.fn();
const mockQuoteToCalls = vi.fn();
const mockFetchVerifiedTokenBySymbol = vi.fn();

vi.mock("@avnu/avnu-sdk", () => ({
  getQuotes: mockGetQuotes,
  quoteToCalls: mockQuoteToCalls,
  fetchTokenByAddress: vi.fn(),
  fetchVerifiedTokenBySymbol: mockFetchVerifiedTokenBySymbol,
}));

// Mock x402-starknet (its real behaviour is covered by tools/x402-sign-payment-required.test.ts
// and the package's own tests; here we check the server wiring around it).
const mockPrepareStarknetPayment = vi.fn();
const mockSignPreparedStarknetPayment = vi.fn();

vi.mock("@starknetfoundation/starknet-agentic-x402-starknet", () => ({
  prepareStarknetPayment: mockPrepareStarknetPayment,
  signPreparedStarknetPayment: mockSignPreparedStarknetPayment,
  networkForChainId: vi.fn((chainId: string) => {
    if (chainId === "0x534e5f5345504f4c4941") return "starknet:SN_SEPOLIA";
    throw new Error(`Chain id ${chainId} is not a supported Starknet network`);
  }),
}));

// Mock MCP SDK
const mockServerConnect = vi.fn();
let capturedToolHandler: ((request: any) => Promise<any>) | null = null;
let capturedListHandler: (() => Promise<any>) | null = null;

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(function MockServer() {
    return {
      setRequestHandler: vi.fn((schema: any, handler: any) => {
        if (schema.method === "tools/list") {
          capturedListHandler = handler;
        } else if (schema.method === "tools/call") {
          capturedToolHandler = handler;
        }
      }),
      connect: mockServerConnect,
    };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: { method: "tools/call" },
  ListToolsRequestSchema: { method: "tools/list" },
}));

// Helper to call a tool
async function callTool(name: string, args: Record<string, any>) {
  if (!capturedToolHandler) {
    throw new Error("Tool handler not captured - did the module load correctly?");
  }
  return capturedToolHandler({
    params: { name, arguments: args },
  });
}

// Helper to parse tool response
function parseResponse(response: any) {
  const text = response.content[0]?.text;
  return text ? JSON.parse(text) : null;
}

// Structured log output (process.stderr.write) is suppressed during module
// imports in beforeEach blocks to keep test output clean.

describe("MCP Tool Handlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockEstimatePaymasterTransactionFee.mockResolvedValue({
      suggested_max_fee_in_gas_token: "0",
    });
    mockWaitForTransaction.mockResolvedValue({
      execution_status: "SUCCEEDED",
      finality_status: "ACCEPTED_ON_L2",
    });
    capturedToolHandler = null;
    capturedListHandler = null;

    // Set environment variables
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }

    // Suppress server startup log output
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Reset module cache and re-import to capture handlers
    vi.resetModules();

    // Import the server module to trigger handler registration
    await import("../../src/index.js");

    // Restore stderr for test assertions
    stderrSpy.mockRestore();
  });

  afterEach(() => {
    // Clean up environment
    for (const key of Object.keys(mockEnv)) {
      delete process.env[key];
    }
  });

  describe("starknet_get_balance", () => {
    it("returns formatted balance for known token", async () => {
      mockBalanceOf.mockResolvedValue({
        balance: { low: BigInt("1000000000000000000"), high: BigInt(0) },
      });

      const response = await callTool("starknet_get_balance", {
        token: "ETH",
      });

      const result = parseResponse(response);
      expect(result.token).toBe("ETH");
      expect(result.tokenAddress).toBe(TOKENS.ETH);
      expect(result.balance).toBe("1");
      expect(result.raw).toBe("1000000000000000000");
      expect(result.decimals).toBe(18);
    });

    it("uses default address when not provided", async () => {
      mockBalanceOf.mockResolvedValue({
        balance: { low: BigInt("500000"), high: BigInt(0) },
      });

      const response = await callTool("starknet_get_balance", {
        token: "USDC",
      });

      const result = parseResponse(response);
      expect(result.address).toBe(mockEnv.STARKNET_ACCOUNT_ADDRESS);
      expect(result.balance).toBe("0.5");
      expect(result.decimals).toBe(6);
    });

    it("accepts custom address", async () => {
      const customAddress = "0x0987654321098765432109876543210987654321098765432109876543210987";
      mockBalanceOf.mockResolvedValue(BigInt("2000000000000000000"));

      const response = await callTool("starknet_get_balance", {
        address: customAddress,
        token: "STRK",
      });

      const result = parseResponse(response);
      expect(result.address).toBe(customAddress);
    });

    it("handles zero balance", async () => {
      mockBalanceOf.mockResolvedValue(BigInt(0));

      const response = await callTool("starknet_get_balance", {
        token: "ETH",
      });

      const result = parseResponse(response);
      expect(result.balance).toBe("0");
      expect(result.raw).toBe("0");
    });

    it("returns error for unknown token", async () => {
      const response = await callTool("starknet_get_balance", {
        token: "UNKNOWN_TOKEN",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.tool).toBe("starknet_get_balance");
    });
  });

  describe("starknet_register_agent", () => {
    it("is listed when ERC8004_IDENTITY_REGISTRY_ADDRESS is configured", async () => {
      if (!capturedListHandler) {
        throw new Error("List handler not captured - did the module load correctly?");
      }
      const resp = await capturedListHandler();
      const toolNames = resp.tools.map((t: any) => t.name);
      expect(toolNames).toContain("starknet_register_agent");
    });

    it("registers with token_uri and parses agent_id from receipt event keys (Registered)", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xabc" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
        events: [
          {
            from_address: mockEnv.ERC8004_IDENTITY_REGISTRY_ADDRESS,
            // Registered has agent_id as a #[key] u256, so it is encoded in event keys.
            keys: ["selector:Registered", "0x01", "0x00"],
            data: ["0xdead"],
          },
        ],
      });

      const response = await callTool("starknet_register_agent", {
        token_uri: "ipfs://demo",
        gasfree: false,
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xabc");
      expect(result.agentId).toBe("1");

      // Ensure the tool invoked IdentityRegistry with the expected entrypoint.
      expect(mockExecute).toHaveBeenCalled();
      const callArg = mockExecute.mock.calls[0][0];
      expect(callArg.entrypoint).toBe("register_with_token_uri");
      expect(callArg.contractAddress).toBe(mockEnv.ERC8004_IDENTITY_REGISTRY_ADDRESS);
      expect(Array.isArray(callArg.calldata)).toBe(true);
      expect(callArg.calldata.length).toBeGreaterThan(0);
    });
  });

  describe("starknet_get_balances", () => {
    it("returns multiple token balances", async () => {
      mockBalanceOf
        .mockResolvedValueOnce({ balance: { low: BigInt("1000000000000000000"), high: BigInt(0) } })
        .mockResolvedValueOnce({ balance: { low: BigInt("500000"), high: BigInt(0) } });

      const response = await callTool("starknet_get_balances", {
        tokens: ["ETH", "USDC"],
      });

      const result = parseResponse(response);
      expect(result.balances).toHaveLength(2);
      expect(result.tokensQueried).toBe(2);
    });

    it("returns error for empty tokens array", async () => {
      const response = await callTool("starknet_get_balances", {
        tokens: [],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("At least one token is required");
    });

    it("returns error for duplicate tokens", async () => {
      const response = await callTool("starknet_get_balances", {
        tokens: ["ETH", "ETH"],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("Duplicate tokens");
    });
  });

  describe("starknet_transfer", () => {
    const recipient = "0x0111111111111111111111111111111111111111111111111111111111111111";

    it("executes transfer without gasfree mode", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xabc123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_transfer", {
        recipient,
        token: "ETH",
        amount: "1.5",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xabc123");
      expect(result.recipient).toBe(recipient);
      expect(result.token).toBe("ETH");
      expect(result.amount).toBe("1.5");
      expect(result.gasfree).toBe(false);
      expect(mockExecute).toHaveBeenCalled();
    });

    it("executes transfer with gasfree mode (no API key)", async () => {
      mockExecutePaymasterTransaction.mockResolvedValue({ transaction_hash: "0xpaymaster456" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_transfer", {
        recipient,
        token: "USDC",
        amount: "100",
        gasfree: true,
        gasToken: "STRK",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xpaymaster456");
      expect(result.gasfree).toBe(true);
      expect(mockExecutePaymasterTransaction).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          feeMode: expect.objectContaining({ mode: "default" }),
        }),
        expect.anything(),
      );
    });

    it("handles decimal amounts correctly", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xdef789" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      await callTool("starknet_transfer", {
        recipient,
        token: "USDC",
        amount: "0.5",
      });

      // USDC has 6 decimals, so 0.5 USDC = 500000 wei
      expect(mockExecute).toHaveBeenCalled();
    });

    it("returns error on transaction failure", async () => {
      mockExecute.mockRejectedValue(new Error("Transaction reverted"));

      const response = await callTool("starknet_transfer", {
        recipient,
        token: "ETH",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
    });

    it("simulates transfer when dryRun is true", async () => {
      const response = await callTool("starknet_transfer", {
        recipient,
        token: "ETH",
        amount: "1",
        dryRun: true,
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.transactionHash).toBeNull();
      expect(mockExecute).not.toHaveBeenCalled();
      expect(mockExecutePaymasterTransaction).not.toHaveBeenCalled();
      expect(mockWaitForTransaction).not.toHaveBeenCalled();
    });

    it("returns error when transaction receipt is reverted", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xabc123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "REVERTED",
        finality_status: "ACCEPTED_ON_L2",
        revert_reason: "Spending: exceeds per-call",
      });

      const response = await callTool("starknet_transfer", {
        recipient,
        token: "ETH",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toContain("failed during starknet_transfer");
      expect(result.message).toContain("Spending: exceeds per-call");
    });

    it("returns error when transfer finality status is rejected", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xabc124" });
      mockWaitForTransaction.mockResolvedValue({
        finality_status: "REJECTED",
      });

      const response = await callTool("starknet_transfer", {
        recipient,
        token: "ETH",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toContain("failed during starknet_transfer");
      expect(result.message).toContain("status=REJECTED");
    });
  });

  describe("starknet_call_contract", () => {
    const contractAddress = "0x0222222222222222222222222222222222222222222222222222222222222222";

    it("calls contract and returns result", async () => {
      mockCallContract.mockResolvedValue(["0x1", "0x2", "0x3"]);

      const response = await callTool("starknet_call_contract", {
        contractAddress,
        entrypoint: "get_owner",
      });

      const result = parseResponse(response);
      expect(result.result).toEqual(["0x1", "0x2", "0x3"]);
      expect(result.contractAddress).toBe(contractAddress);
      expect(result.entrypoint).toBe("get_owner");
    });

    it("passes calldata to contract", async () => {
      mockCallContract.mockResolvedValue({ result: ["0x100"] });

      await callTool("starknet_call_contract", {
        contractAddress,
        entrypoint: "balanceOf",
        calldata: ["0x123"],
      });

      expect(mockCallContract).toHaveBeenCalledWith({
        contractAddress,
        entrypoint: "balanceOf",
        calldata: ["0x123"],
      });
    });

    it("normalizes decimal calldata to 0x-prefixed felt", async () => {
      mockCallContract.mockResolvedValue({ result: ["0x1"] });

      await callTool("starknet_call_contract", {
        contractAddress,
        entrypoint: "balanceOf",
        calldata: ["100"],
      });

      expect(mockCallContract).toHaveBeenCalledWith({
        contractAddress,
        entrypoint: "balanceOf",
        calldata: ["0x64"],
      });
    });

    it("handles result wrapped in object", async () => {
      mockCallContract.mockResolvedValue({ result: ["0x42"] });

      const response = await callTool("starknet_call_contract", {
        contractAddress,
        entrypoint: "get_value",
      });

      const result = parseResponse(response);
      expect(result.result).toEqual(["0x42"]);
    });
  });

  describe("starknet_invoke_contract", () => {
    const contractAddress = "0x0333333333333333333333333333333333333333333333333333333333333333";

    it("invokes contract without gasfree mode", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xinvoke123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_invoke_contract", {
        contractAddress,
        entrypoint: "set_value",
        calldata: ["0x42"],
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xinvoke123");
      expect(result.contractAddress).toBe(contractAddress);
      expect(result.entrypoint).toBe("set_value");
      expect(result.gasfree).toBe(false);
    });

    it("invokes contract with gasfree mode", async () => {
      mockEstimatePaymasterTransactionFee.mockResolvedValue({
        suggested_max_fee_in_gas_token: "0x0",
      });
      mockExecutePaymasterTransaction.mockResolvedValue({
        transaction_hash: "0xgasfree789",
      });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_invoke_contract", {
        contractAddress,
        entrypoint: "transfer",
        calldata: [
          "0x0111111111111111111111111111111111111111111111111111111111111111",
          "100",
        ],
        gasfree: true,
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(mockExecutePaymasterTransaction).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          feeMode: expect.objectContaining({ mode: "default" }),
        }),
        expect.anything()
      );
    });
  });

  describe("starknet_build_calls", () => {
    const contractAddress = "0x0222222222222222222222222222222222222222222222222222222222222222";

    it("returns validated unsigned calls", async () => {
      const response = await callTool("starknet_build_calls", {
        calls: [
          {
            contractAddress,
            entrypoint: "transfer",
            calldata: ["0x123", "0x64"],
          },
        ],
      });

      const result = parseResponse(response);
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0].contractAddress).toBe(contractAddress);
      expect(result.calls[0].entrypoint).toBe("transfer");
      expect(result.calls[0].calldata).toEqual(["0x123", "0x64"]);
      expect(result.callCount).toBe(1);
      expect(result.note).toContain("Unsigned");
      // Must NOT trigger execution
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("handles multiple calls (multicall)", async () => {
      const addr2 = "0x0333333333333333333333333333333333333333333333333333333333333333";
      const response = await callTool("starknet_build_calls", {
        calls: [
          { contractAddress, entrypoint: "approve", calldata: ["0xabc", "0x100"] },
          { contractAddress: addr2, entrypoint: "swap", calldata: ["0x1"] },
        ],
      });

      const result = parseResponse(response);
      expect(result.calls).toHaveLength(2);
      expect(result.callCount).toBe(2);
      expect(result.calls[0].entrypoint).toBe("approve");
      expect(result.calls[1].entrypoint).toBe("swap");
    });

    it("normalizes decimal calldata to hex", async () => {
      const response = await callTool("starknet_build_calls", {
        calls: [
          { contractAddress, entrypoint: "set_value", calldata: ["100"] },
        ],
      });

      const result = parseResponse(response);
      expect(result.calls[0].calldata).toEqual(["0x64"]);
    });

    it("rejects empty calls array", async () => {
      const response = await callTool("starknet_build_calls", {
        calls: [],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("must not be empty");
    });

    it("rejects invalid contract address", async () => {
      mockValidateAndParseAddress.mockImplementationOnce(() => {
        throw new Error("Invalid address format");
      });

      const response = await callTool("starknet_build_calls", {
        calls: [
          { contractAddress: "bad", entrypoint: "foo" },
        ],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
    });

    it("rejects invalid calldata felt", async () => {
      const response = await callTool("starknet_build_calls", {
        calls: [
          { contractAddress, entrypoint: "foo", calldata: ["0xnotafelt"] },
        ],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
    });

    it("allows calls without calldata", async () => {
      const response = await callTool("starknet_build_calls", {
        calls: [
          { contractAddress, entrypoint: "get_count" },
        ],
      });

      const result = parseResponse(response);
      expect(result.calls).toHaveLength(1);
      expect(result.calls[0].calldata).toEqual([]);
    });
  });

  // ---- Input validation tests ----

  describe("input validation", () => {
    it("rejects invalid recipient address in starknet_transfer", async () => {
      mockValidateAndParseAddress.mockImplementationOnce(() => {
        throw new Error("Invalid address format");
      });

      const response = await callTool("starknet_transfer", {
        recipient: "not_an_address",
        token: "ETH",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/not a valid Starknet address/);
    });

    it("rejects invalid contractAddress in starknet_call_contract", async () => {
      mockValidateAndParseAddress.mockImplementationOnce(() => {
        throw new Error("Invalid address format");
      });

      const response = await callTool("starknet_call_contract", {
        contractAddress: "garbage",
        entrypoint: "get_owner",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/not a valid Starknet address/);
    });

    it("rejects invalid contractAddress in starknet_invoke_contract", async () => {
      mockValidateAndParseAddress.mockImplementationOnce(() => {
        throw new Error("Invalid address format");
      });

      const response = await callTool("starknet_invoke_contract", {
        contractAddress: "garbage",
        entrypoint: "set_value",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/not a valid Starknet address/);
    });

    it("rejects invalid calldata felt in starknet_call_contract", async () => {
      const response = await callTool("starknet_call_contract", {
        contractAddress: "0x0222222222222222222222222222222222222222222222222222222222222222",
        entrypoint: "balanceOf",
        calldata: ["0xrecipient"],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/calldata\[0\]/);
      expect(result.message).toMatch(/valid felt/);
    });

    it("rejects too-large calldata arrays in starknet_invoke_contract", async () => {
      const big = Array.from({ length: 300 }, () => "0x1");
      const response = await callTool("starknet_invoke_contract", {
        contractAddress: "0x0333333333333333333333333333333333333333333333333333333333333333",
        entrypoint: "set_value",
        calldata: big,
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/calldata too large/i);
    });

    it("rejects malformed amount in starknet_transfer", async () => {
      const response = await callTool("starknet_transfer", {
        recipient: "0x0111111111111111111111111111111111111111111111111111111111111111",
        token: "ETH",
        amount: "1e18",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/Invalid amount/);
    });

    it("rejects negative amount in starknet_transfer", async () => {
      const response = await callTool("starknet_transfer", {
        recipient: "0x0111111111111111111111111111111111111111111111111111111111111111",
        token: "ETH",
        amount: "-5",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toMatch(/Invalid amount/);
    });
  });

  describe("starknet_vesu_deposit", () => {
    const VTOKEN_STRK =
      "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";

    it("deposits to Vesu Prime pool successfully", async () => {
      mockCallContract.mockResolvedValueOnce([VTOKEN_STRK]);
      mockExecute.mockResolvedValue({ transaction_hash: "0xvesu123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_vesu_deposit", {
        token: "STRK",
        amount: "10",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xvesu123");
      expect(result.token).toBe("STRK");
      expect(result.amount).toBe("10");
      expect(result.pool).toBe("prime");
      expect(mockExecute).toHaveBeenCalled();
    });

    it("uses custom pool when provided", async () => {
      mockCallContract.mockResolvedValueOnce([VTOKEN_STRK]);
      mockExecute.mockResolvedValue({ transaction_hash: "0xvesu456" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_vesu_deposit", {
        token: "USDC",
        amount: "100",
        pool: "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(mockCallContract).toHaveBeenCalledWith(
        expect.objectContaining({
          entrypoint: "v_token_for_asset",
        })
      );
    });

    it("returns error for invalid amount", async () => {
      const response = await callTool("starknet_vesu_deposit", {
        token: "STRK",
        amount: "1e18",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toMatch(/Invalid amount|Invalid decimal/);
    });

    it("returns error when vToken not found", async () => {
      mockCallContract.mockResolvedValueOnce([]);

      const response = await callTool("starknet_vesu_deposit", {
        token: "STRK",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toMatch(/vToken not found|not found/);
    });
  });

  describe("starknet_vesu_withdraw", () => {
    const VTOKEN_STRK =
      "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";

    it("withdraws from Vesu successfully", async () => {
      mockCallContract.mockResolvedValueOnce([VTOKEN_STRK]);
      mockExecute.mockResolvedValue({ transaction_hash: "0xwithdraw123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_vesu_withdraw", {
        token: "STRK",
        amount: "5",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xwithdraw123");
      expect(result.token).toBe("STRK");
      expect(result.amount).toBe("5");
      expect(mockExecute).toHaveBeenCalled();
    });

    it("returns error for zero amount", async () => {
      const response = await callTool("starknet_vesu_withdraw", {
        token: "STRK",
        amount: "0",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toMatch(/Invalid amount|positive|zero/);
    });
  });

  describe("starknet_vesu_positions", () => {
    const VTOKEN_STRK =
      "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";

    it("returns lending positions for user", async () => {
      const oneEth = "0xde0b6b3a7640000"; // 1e18
      mockCallContract
        .mockResolvedValueOnce([VTOKEN_STRK])
        .mockResolvedValueOnce([oneEth, "0x0"])
        .mockResolvedValueOnce([oneEth, "0x0"]);

      const response = await callTool("starknet_vesu_positions", {
        tokens: ["STRK"],
      });

      const result = parseResponse(response);
      expect(result.positions).toBeDefined();
      expect(Array.isArray(result.positions)).toBe(true);
      expect(result.positions.length).toBeGreaterThan(0);
      expect(result.positions[0]).toHaveProperty("token");
      expect(result.positions[0]).toHaveProperty("tokenAddress");
      expect(result.positions[0]).toHaveProperty("shares");
      expect(result.positions[0]).toHaveProperty("assets");
    });

    it("returns error for empty tokens", async () => {
      const response = await callTool("starknet_vesu_positions", {
        tokens: [],
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toMatch(/required|At least one/);
    });
  });

  describe("starknet_swap", () => {
    const mockQuote = {
      quoteId: "quote-123",
      sellTokenAddress: TOKENS.ETH,
      buyTokenAddress: TOKENS.USDC,
      sellAmount: BigInt(1e18),
      buyAmount: BigInt(3200e6),
      sellAmountInUsd: 3200,
      buyAmountInUsd: 3199.5,
      priceImpact: 15,
      gasFees: BigInt(0),
      gasFeesInUsd: 0.02,
      chainId: "SN_MAIN",
      routes: [
        { name: "Ekubo", percent: 0.8 },
        { name: "JediSwap", percent: 0.2 },
      ],
    };

    it("executes swap successfully", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);
      mockQuoteToCalls.mockResolvedValue({
        calls: [
          { contractAddress: TOKENS.ETH, entrypoint: "approve", calldata: [] },
          { contractAddress: "0xrouter", entrypoint: "swap", calldata: [] },
        ],
        chainId: "SN_MAIN",
      });
      mockExecute.mockResolvedValue({ transaction_hash: "0xswap123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xswap123");
      expect(result.sellToken).toBe("ETH");
      expect(result.buyToken).toBe("USDC");
    });

    it("returns error when no quotes available", async () => {
      mockGetQuotes.mockResolvedValue([]);

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("No swap routes available");
    });

    it("returns error for unknown token", async () => {
      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "UNKNOWN_TOKEN",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("Failed to fetch token");
    });

    it("respects slippage parameter", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);
      mockQuoteToCalls.mockResolvedValue({ calls: [], chainId: "SN_MAIN" });
      mockExecute.mockResolvedValue({ transaction_hash: "0x123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
        slippage: 0.02,
      });

      expect(mockQuoteToCalls).toHaveBeenCalledWith(
        expect.objectContaining({ slippage: 0.02 }),
        expect.any(Object)
      );
    });

    it("returns error when swap receipt is reverted", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);
      mockQuoteToCalls.mockResolvedValue({
        calls: [
          { contractAddress: TOKENS.ETH, entrypoint: "approve", calldata: [] },
          { contractAddress: "0xrouter", entrypoint: "swap", calldata: [] },
        ],
        chainId: "SN_MAIN",
      });
      mockExecute.mockResolvedValue({ transaction_hash: "0xswapbad" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "REVERTED",
        finality_status: "ACCEPTED_ON_L2",
        revert_reason: "Spending: exceeds window limit",
      });

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toContain("failed during starknet_swap");
      expect(result.message).toContain("Spending: exceeds window limit");
    });

    it("returns error when swap finality status is rejected", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);
      mockQuoteToCalls.mockResolvedValue({
        calls: [
          { contractAddress: TOKENS.ETH, entrypoint: "approve", calldata: [] },
          { contractAddress: "0xrouter", entrypoint: "swap", calldata: [] },
        ],
        chainId: "SN_MAIN",
      });
      mockExecute.mockResolvedValue({ transaction_hash: "0xswaprej" });
      mockWaitForTransaction.mockResolvedValue({
        finality_status: "REJECTED",
      });

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.error).toBe(true);
      expect(result.message).toContain("failed during starknet_swap");
      expect(result.message).toContain("status=REJECTED");
    });
  });

  describe("starknet_get_quote", () => {
    const mockQuote = {
      quoteId: "quote-456",
      sellTokenAddress: TOKENS.ETH,
      buyTokenAddress: TOKENS.USDC,
      sellAmount: BigInt(1e18),
      buyAmount: BigInt(3200e6),
      sellAmountInUsd: 3200,
      buyAmountInUsd: 3199.5,
      priceImpact: 10,
      routes: [{ name: "Ekubo", percent: 1.0 }],
    };

    it("returns quote without executing", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);

      const response = await callTool("starknet_get_quote", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      const result = parseResponse(response);
      expect(result.sellToken).toBe("ETH");
      expect(result.buyToken).toBe("USDC");
      expect(result.quoteId).toBe("quote-456");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("formats price impact correctly", async () => {
      mockGetQuotes.mockResolvedValue([mockQuote]);

      const response = await callTool("starknet_get_quote", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      const result = parseResponse(response);
      expect(result.priceImpact).toBe("0.10%");
    });

    it("returns error when no quotes", async () => {
      mockGetQuotes.mockResolvedValue([]);

      const response = await callTool("starknet_get_quote", {
        sellToken: "ETH",
        buyToken: "UNKNOWN",
        amount: "1",
      });

      expect(response.isError).toBe(true);
    });
  });

  describe("starknet_estimate_fee", () => {
    it("returns fee estimation", async () => {
      mockEstimateInvokeFee.mockResolvedValue({
        overall_fee: BigInt("1000000000000000"),
        resourceBounds: {
          l1_gas: { max_amount: "1000", max_price_per_unit: "100000000" },
          l2_gas: { max_amount: "0", max_price_per_unit: "0" },
        },
        unit: "STRK",
      });

      const response = await callTool("starknet_estimate_fee", {
        contractAddress: "0x444",
        entrypoint: "test_function",
      });

      const result = parseResponse(response);
      expect(result.overallFee).toBe("0.001");
      expect(result.unit).toBe("STRK");
      expect(result.resourceBounds).toBeDefined();
    });

    it("passes calldata correctly", async () => {
      mockEstimateInvokeFee.mockResolvedValue({
        overall_fee: BigInt(0),
        resourceBounds: {},
      });

      await callTool("starknet_estimate_fee", {
        contractAddress: "0x555",
        entrypoint: "call_with_args",
        calldata: ["0x1", "0x2"],
      });

      expect(mockEstimateInvokeFee).toHaveBeenCalledWith(
        expect.objectContaining({
          entrypoint: "call_with_args",
          calldata: ["0x1", "0x2"],
        }),
      );
    });
  });

  describe("x402_starknet_sign_payment_required", () => {
    const X402_PAY_TO = "0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57";
    const prepared = {
      x402Version: 2,
      acceptIndex: 0,
      payer: mockEnv.STARKNET_ACCOUNT_ADDRESS,
      maxTimeoutSecondsCap: 3600,
      requirements: {
        scheme: "exact",
        network: "starknet:SN_SEPOLIA",
        asset: TOKENS.STRK,
        payTo: X402_PAY_TO,
        amount: 2n * 10n ** 18n,
        maxTimeoutSeconds: 300,
        feePayer: "0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81",
      },
      accepted: {},
      resource: { url: "https://api.example.com/premium" },
    };
    const signed = {
      headerValue: "c2lnbmVkLXBheW1lbnQ=",
      paymentPayload: {},
      summary: {
        network: "starknet:SN_SEPOLIA",
        acceptIndex: 0,
        resourceUrl: "https://api.example.com/premium",
        asset: TOKENS.STRK,
        payTo: X402_PAY_TO,
        amount: (2n * 10n ** 18n).toString(),
        feePayer: "0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81",
        payer: mockEnv.STARKNET_ACCOUNT_ADDRESS,
        nonce: "0x1",
        validAfter: 1,
        validUntil: 1790000300,
        validUntilIso: "2026-09-21T14:18:20.000Z",
      },
    };

    beforeEach(() => {
      mockPrepareStarknetPayment.mockReturnValue(prepared);
      mockSignPreparedStarknetPayment.mockResolvedValue(signed);
    });

    afterEach(() => {
      delete process.env.STARKNET_MCP_POLICY;
    });

    it("builds the payment for the account's chain and returns the header and a summary", async () => {
      const response = await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "eyJ4NDAyVmVyc2lvbiI6Mn0=",
        acceptIndex: 0,
      });

      expect(response.isError).toBeFalsy();
      const result = parseResponse(response);
      expect(result.paymentSignatureHeader).toBe(signed.headerValue);
      expect(result.summary).toMatchObject({
        ...signed.summary,
        assetSymbol: "STRK",
        decimals: 18,
        amountFormatted: "2",
      });
      expect(result.summary.description).toContain("2 STRK");
      expect(result.payload).toBeUndefined();
      expect(mockGetChainId).toHaveBeenCalled();
      expect(mockPrepareStarknetPayment).toHaveBeenCalledWith({
        paymentRequiredHeader: "eyJ4NDAyVmVyc2lvbiI6Mn0=",
        network: "starknet:SN_SEPOLIA",
        accountAddress: mockEnv.STARKNET_ACCOUNT_ADDRESS,
        acceptIndex: 0,
      });
      expect(mockSignPreparedStarknetPayment).toHaveBeenCalledWith(prepared, {
        privateKey: mockEnv.STARKNET_PRIVATE_KEY,
      });
    });

    it("ignores extra params and always signs with the env-configured account", async () => {
      await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
        // These are intentionally ignored to avoid signing arbitrary key material or documents.
        rpcUrl: "https://custom.rpc.url",
        accountAddress: "0xcustom",
        privateKey: "0xprivate",
        typedData: { message: {} },
      });

      expect(mockPrepareStarknetPayment).toHaveBeenCalledWith({
        paymentRequiredHeader: "test",
        network: "starknet:SN_SEPOLIA",
        accountAddress: mockEnv.STARKNET_ACCOUNT_ADDRESS,
        acceptIndex: undefined,
      });
      expect(mockSignPreparedStarknetPayment).toHaveBeenCalledWith(prepared, {
        privateKey: mockEnv.STARKNET_PRIVATE_KEY,
      });
    });

    it("enforces the transfer policy from STARKNET_MCP_POLICY before signing", async () => {
      process.env.STARKNET_MCP_POLICY = JSON.stringify({ transfer: { maxAmountPerCall: "1" } });
      vi.resetModules();
      await import("../../src/index.js");

      const response = await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
      });

      expect(response.isError).toBe(true);
      expect(parseResponse(response).message).toBe(
        "Policy violation: Payment amount 2 exceeds policy limit of 1"
      );
      expect(mockSignPreparedStarknetPayment).not.toHaveBeenCalled();
    });

    it("signs when the payment is within the configured policy", async () => {
      process.env.STARKNET_MCP_POLICY = JSON.stringify({
        transfer: { maxAmountPerCall: "5", allowedRecipients: [X402_PAY_TO], allowedTokens: ["STRK"] },
      });
      vi.resetModules();
      await import("../../src/index.js");

      const response = await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
      });

      expect(response.isError).toBeFalsy();
      expect(mockSignPreparedStarknetPayment).toHaveBeenCalledTimes(1);
    });

    it("blocks x402 signing in proxy signer mode", async () => {
      process.env.STARKNET_SIGNER_MODE = "proxy";
      delete process.env.STARKNET_PRIVATE_KEY;

      vi.resetModules();
      await import("../../src/index.js");

      const response = await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("disabled in STARKNET_SIGNER_MODE=proxy");
      expect(mockPrepareStarknetPayment).not.toHaveBeenCalled();
      expect(mockSignPreparedStarknetPayment).not.toHaveBeenCalled();
    });
  });

  describe("starknet_deploy_agent_account", () => {
    beforeEach(async () => {
      process.env.AGENT_ACCOUNT_FACTORY_ADDRESS =
        "0x0fabcde01234567890abcdef01234567890abcdef01234567890abcdef01234";

      vi.resetModules();
      await import("../../src/index.js");
    });

    afterEach(() => {
      delete process.env.AGENT_ACCOUNT_FACTORY_ADDRESS;
    });

    it("deploys via factory and returns tx receipt-derived data", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xdeploy123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
        events: [
          {
            from_address: process.env.AGENT_ACCOUNT_FACTORY_ADDRESS,
            keys: ["selector:AccountDeployed"],
            // account, public_key, agent_id.low, agent_id.high, registry
            data: ["0xabc", "0x1234", "0x2a", "0x0", "0xregistry"],
          },
        ],
      });

      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "0x1234",
        token_uri: "ipfs://agent.json",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xdeploy123");
      expect(result.accountAddress).toBe("0xabc");
      expect(result.agentId).toBe("42");
      expect(result.factoryAddress).toBe(process.env.AGENT_ACCOUNT_FACTORY_ADDRESS);

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const callArg = mockExecute.mock.calls[0][0];
      expect(callArg.contractAddress).toBe(process.env.AGENT_ACCOUNT_FACTORY_ADDRESS);
      expect(callArg.entrypoint).toBe("deploy_account");
    });

    it("returns clear error for zero public key", async () => {
      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "0x0",
        token_uri: "ipfs://agent.json",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("public_key must be non-zero felt");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("propagates tx reverts", async () => {
      mockExecute.mockRejectedValue(new Error("factory revert: duplicate salt"));

      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "0x1234",
        token_uri: "ipfs://agent.json",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("factory revert");
    });

    it("returns clear error when factory env is missing", async () => {
      delete process.env.AGENT_ACCOUNT_FACTORY_ADDRESS;
      vi.resetModules();
      await import("../../src/index.js");

      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "0x1234",
        token_uri: "ipfs://agent.json",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("AGENT_ACCOUNT_FACTORY_ADDRESS not configured");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("uses sponsored paymaster params when gasfree=true and API key is set", async () => {
      process.env.AVNU_PAYMASTER_API_KEY = "test-sponsor-key";
      vi.resetModules();
      await import("../../src/index.js");

      mockEstimatePaymasterTransactionFee.mockResolvedValue({
        suggested_max_fee_in_gas_token: "0x0",
      });
      mockExecutePaymasterTransaction.mockResolvedValue({
        transaction_hash: "0xdeploy-sponsored",
      });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
        events: [
          {
            from_address: process.env.AGENT_ACCOUNT_FACTORY_ADDRESS,
            data: ["0xabc", "0x1234", "0x2a", "0x0", "0xregistry"],
          },
        ],
      });

      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "0x1234",
        token_uri: "ipfs://agent.json",
        gasfree: true,
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(mockExecutePaymasterTransaction).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          feeMode: expect.objectContaining({ mode: "sponsored" }),
        }),
        expect.anything()
      );

      delete process.env.AVNU_PAYMASTER_API_KEY;
    });

    it("returns clear error for out-of-range public key", async () => {
      const tooLarge = (1n << 251n).toString(); // 2^251, one above max allowed
      const response = await callTool("starknet_deploy_agent_account", {
        public_key: tooLarge,
        token_uri: "ipfs://demo",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("public_key must fit in 251 bits");
    });

    it("returns clear error for out-of-range salt", async () => {
      const tooLarge = (1n << 251n).toString();
      const response = await callTool("starknet_deploy_agent_account", {
        public_key: "1",
        token_uri: "ipfs://demo",
        salt: tooLarge,
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("salt must fit in 251 bits");
    });
  });

  describe("starknet_set_agent_metadata", () => {
    it("sets metadata and returns tx hash", async () => {
      mockExecute.mockResolvedValue({ transaction_hash: "0xmeta123" });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_set_agent_metadata", {
        agent_id: "1",
        key: "agentName",
        value: "My Trading Bot",
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xmeta123");
      expect(result.agentId).toBe("1");
      expect(result.key).toBe("agentName");
      expect(result.value).toBe("My Trading Bot");

      expect(mockExecute).toHaveBeenCalled();
      const callArg = mockExecute.mock.calls[0][0];
      expect(callArg.entrypoint).toBe("set_metadata");
      expect(callArg.contractAddress).toBe(mockEnv.ERC8004_IDENTITY_REGISTRY_ADDRESS);
    });

    it("rejects reserved agentWallet key", async () => {
      const response = await callTool("starknet_set_agent_metadata", {
        agent_id: "1",
        key: "agentWallet",
        value: "0xabc",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("agentWallet");
      expect(result.message).toContain("reserved");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("rejects empty key", async () => {
      const response = await callTool("starknet_set_agent_metadata", {
        agent_id: "1",
        key: "",
        value: "test",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("key is required");
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it("supports gasfree mode", async () => {
      mockEstimatePaymasterTransactionFee.mockResolvedValue({
        suggested_max_fee_in_gas_token: "0x0",
      });
      mockExecutePaymasterTransaction.mockResolvedValue({
        transaction_hash: "0xmetapaymaster",
      });
      mockWaitForTransaction.mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      });

      const response = await callTool("starknet_set_agent_metadata", {
        agent_id: "1",
        key: "capabilities",
        value: "swap,arbitrage",
        gasfree: true,
      });

      const result = parseResponse(response);
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xmetapaymaster");
      expect(mockExecutePaymasterTransaction).toHaveBeenCalled();
    });
  });

  describe("starknet_get_agent_metadata", () => {
    it("reads metadata and returns decoded value", async () => {
      // ByteArray: [data_len, ...data_words, pending_word, pending_word_len]
      mockCallContract.mockResolvedValue([
        "0x0",  // data_len = 0
        "0x4d79205472616469",  // pending_word
        "0x8",  // pending_word_len
      ]);

      const response = await callTool("starknet_get_agent_metadata", {
        agent_id: "1",
        key: "agentName",
      });

      const result = parseResponse(response);
      expect(result.agentId).toBe("1");
      expect(result.key).toBe("agentName");
      // The mock stringFromByteArray returns "TEST"
      expect(result.value).toBe("TEST");
      expect(result.identityRegistry).toBe(mockEnv.ERC8004_IDENTITY_REGISTRY_ADDRESS);
    });

    it("rejects empty key", async () => {
      const response = await callTool("starknet_get_agent_metadata", {
        agent_id: "1",
        key: "",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("key is required");
      expect(mockCallContract).not.toHaveBeenCalled();
    });

    it("passes correct entrypoint to contract", async () => {
      mockCallContract.mockResolvedValue(["0x0", "0x0", "0x0"]);

      await callTool("starknet_get_agent_metadata", {
        agent_id: "42",
        key: "status",
      });

      expect(mockCallContract).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: mockEnv.ERC8004_IDENTITY_REGISTRY_ADDRESS,
          entrypoint: "get_metadata",
        })
      );
    });
  });

  describe("unknown tool", () => {
    it("returns error for unknown tool", async () => {
      const response = await callTool("unknown_tool", {});

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("Unknown tool");
    });
  });

  describe("error formatting", () => {
    it("formats INSUFFICIENT_LIQUIDITY errors", async () => {
      mockGetQuotes.mockRejectedValue(new Error("INSUFFICIENT_LIQUIDITY"));

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1000000",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("Insufficient liquidity");
    });

    it("formats SLIPPAGE errors", async () => {
      mockGetQuotes.mockResolvedValue([{ quoteId: "q1", buyAmount: BigInt(100) }]);
      mockQuoteToCalls.mockResolvedValue({ calls: [] });
      mockExecute.mockRejectedValue(new Error("SLIPPAGE exceeded"));

      const response = await callTool("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
      });

      expect(response.isError).toBe(true);
      const result = parseResponse(response);
      expect(result.message).toContain("Slippage");
    });
  });
});

describe("MCP Startup Guardrails", () => {
  afterEach(() => {
    for (const key of Object.keys(mockEnv)) {
      delete process.env[key];
    }
    delete process.env.NODE_ENV;
  });

  it("fails startup in production when signer mode is direct", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.NODE_ENV = "production";
    process.env.STARKNET_SIGNER_MODE = "direct";

    vi.resetModules();
    await expect(import("../../src/index.js")).rejects.toThrow(
      "Production mode requires STARKNET_SIGNER_MODE=proxy"
    );
  });

  it("starts in proxy signer mode without STARKNET_PRIVATE_KEY", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.STARKNET_SIGNER_MODE = "proxy";
    delete process.env.STARKNET_PRIVATE_KEY;

    vi.resetModules();
    await import("../../src/index.js");

    expect(mockAccountConstructor).toHaveBeenCalled();
    const accountArgs = mockAccountConstructor.mock.calls.at(-1)?.[0];
    expect(typeof accountArgs?.signer).toBe("object");
    expect(typeof accountArgs?.signer?.signTransaction).toBe("function");
  });

  it("fails startup in proxy mode when keyring auth is missing", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.STARKNET_SIGNER_MODE = "proxy";
    delete process.env.STARKNET_PRIVATE_KEY;
    delete process.env.KEYRING_HMAC_SECRET;

    vi.resetModules();
    await expect(import("../../src/index.js")).rejects.toThrow(
      "Missing keyring proxy configuration for STARKNET_SIGNER_MODE=proxy"
    );
  });

  it("fails startup in production proxy mode if direct private key is still set", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.NODE_ENV = "production";
    process.env.STARKNET_SIGNER_MODE = "proxy";
    process.env.STARKNET_PRIVATE_KEY = "0x1";

    vi.resetModules();
    await expect(import("../../src/index.js")).rejects.toThrow(
      "STARKNET_PRIVATE_KEY must not be set in production when STARKNET_SIGNER_MODE=proxy"
    );
  });

  it("fails startup in production proxy mode when proxy URL is non-https and non-loopback", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.NODE_ENV = "production";
    process.env.STARKNET_SIGNER_MODE = "proxy";
    process.env.KEYRING_PROXY_URL = "http://signer.internal:8545";
    delete process.env.STARKNET_PRIVATE_KEY;

    vi.resetModules();
    await expect(import("../../src/index.js")).rejects.toThrow(
      "Production proxy mode requires KEYRING_PROXY_URL to use https unless loopback is used"
    );
  });

  it("fails startup in production proxy mode when mTLS client cert config is missing", async () => {
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }
    process.env.NODE_ENV = "production";
    process.env.STARKNET_SIGNER_MODE = "proxy";
    process.env.KEYRING_PROXY_URL = "https://signer.internal:8545";
    delete process.env.STARKNET_PRIVATE_KEY;
    delete process.env.KEYRING_TLS_CLIENT_CERT_PATH;
    delete process.env.KEYRING_TLS_CLIENT_KEY_PATH;
    delete process.env.KEYRING_TLS_CA_PATH;

    vi.resetModules();
    await expect(import("../../src/index.js")).rejects.toThrow(
      "Production proxy mode requires KEYRING_TLS_CLIENT_CERT_PATH, KEYRING_TLS_CLIENT_KEY_PATH, and KEYRING_TLS_CA_PATH for mTLS"
    );
  });
});

describe("Tool list", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedToolHandler = null;
    capturedListHandler = null;

    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }

    // Suppress structured log output
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    vi.resetModules();
    await import("../../src/index.js");

    stderrSpy.mockRestore();
  });

  afterEach(() => {
    for (const key of Object.keys(mockEnv)) {
      delete process.env[key];
    }
  });

  it("lists all tools", async () => {
    if (!capturedListHandler) {
      throw new Error("List handler not captured");
    }

    const response = await capturedListHandler();

    expect(response.tools).toHaveLength(21);
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).toContain("starknet_get_balance");
    expect(toolNames).toContain("starknet_get_balances");
    expect(toolNames).toContain("starknet_vesu_deposit");
    expect(toolNames).toContain("starknet_vesu_withdraw");
    expect(toolNames).toContain("starknet_vesu_positions");
    expect(toolNames).toContain("starknet_transfer");
    expect(toolNames).toContain("starknet_call_contract");
    expect(toolNames).toContain("starknet_invoke_contract");
    expect(toolNames).toContain("starknet_swap");
    expect(toolNames).toContain("starknet_get_quote");
    expect(toolNames).toContain("starknet_build_calls");
    expect(toolNames).toContain("starknet_register_session_key");
    expect(toolNames).toContain("starknet_revoke_session_key");
    expect(toolNames).toContain("starknet_get_session_data");
    expect(toolNames).toContain("starknet_build_transfer_calls");
    expect(toolNames).toContain("starknet_build_swap_calls");
    expect(toolNames).toContain("starknet_register_agent");
    expect(toolNames).toContain("starknet_set_agent_metadata");
    expect(toolNames).toContain("starknet_get_agent_metadata");
    expect(toolNames).toContain("starknet_estimate_fee");
    expect(toolNames).toContain("x402_starknet_sign_payment_required");
  });

  it("includes deploy tool when factory env is set", async () => {
    process.env.AGENT_ACCOUNT_FACTORY_ADDRESS =
      "0x0fabcde01234567890abcdef01234567890abcdef01234567890abcdef01234";

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.resetModules();
    await import("../../src/index.js");
    spy.mockRestore();

    if (!capturedListHandler) {
      throw new Error("List handler not captured");
    }

    const response = await capturedListHandler();
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).toContain("starknet_deploy_agent_account");
    expect(response.tools).toHaveLength(22);

    delete process.env.AGENT_ACCOUNT_FACTORY_ADDRESS;
  });

  it("does not list x402 signing tool in proxy mode", async () => {
    process.env.STARKNET_SIGNER_MODE = "proxy";
    delete process.env.STARKNET_PRIVATE_KEY;

    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.resetModules();
    await import("../../src/index.js");
    spy.mockRestore();

    if (!capturedListHandler) {
      throw new Error("List handler not captured");
    }

    const response = await capturedListHandler();
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).not.toContain("x402_starknet_sign_payment_required");
  });
});

describe("Static token network", () => {
  const SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941";
  const MAINNET_CHAIN_ID = "0x534e5f4d41494e";
  const SEPOLIA_USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";
  const SEPOLIA_USDC_E = "0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080";
  const recipient = "0x0111111111111111111111111111111111111111111111111111111111111111";

  let stderr: string[];

  // Start the server and wait until it is connected, i.e. startup has
  // checked the chain id and would accept requests.
  async function startServer(env: Record<string, string>, chainId: string | Error) {
    vi.clearAllMocks();
    capturedToolHandler = null;
    for (const [key, value] of Object.entries({ ...mockEnv, ...env })) {
      process.env[key] = value;
    }
    if (chainId instanceof Error) {
      mockGetChainId.mockRejectedValueOnce(chainId);
    } else {
      mockGetChainId.mockResolvedValueOnce(chainId);
    }
    stderr = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    try {
      vi.resetModules();
      await import("../../src/index.js");
      await vi.waitFor(() => expect(mockServerConnect).toHaveBeenCalledTimes(1));
    } finally {
      spy.mockRestore();
    }
  }

  async function usdcAddress(symbol = "USDC"): Promise<string> {
    const response = await callTool("starknet_build_transfer_calls", {
      tokenAddress: symbol,
      recipientAddress: recipient,
      amount: "1",
    });
    expect(response.isError).toBeFalsy();
    const result = parseResponse(response);
    expect(result.token).toBe(symbol);
    return result.calls[0].contractAddress;
  }

  afterEach(() => {
    for (const key of Object.keys(mockEnv)) {
      delete process.env[key];
    }
  });

  it("resolves USDC and USDC.e to Sepolia addresses on a Sepolia RPC", async () => {
    await startServer({}, SEPOLIA_CHAIN_ID);

    expect(await usdcAddress()).toBe(SEPOLIA_USDC);
    expect(await usdcAddress("USDC.e")).toBe(SEPOLIA_USDC_E);
    expect(stderr.join("")).not.toContain("token_service.");
  });

  it("resolves USDC to the mainnet address on a mainnet RPC", async () => {
    await startServer(
      {
        STARKNET_RPC_URL: "https://starknet-mainnet.example.com",
        AVNU_BASE_URL: "https://starknet.api.avnu.fi",
        AVNU_PAYMASTER_URL: "https://starknet.paymaster.avnu.fi",
      },
      MAINNET_CHAIN_ID
    );

    expect(await usdcAddress()).toBe(TOKENS.USDC);
    expect(stderr.join("")).not.toContain("token_service.");
  });

  async function lookUpUsdt() {
    const response = await callTool("starknet_build_transfer_calls", {
      tokenAddress: "USDT",
      recipientAddress: recipient,
      amount: "1",
    });
    expect(response.isError).toBe(true);
    expect(mockFetchVerifiedTokenBySymbol).toHaveBeenCalledTimes(1);
    return mockFetchVerifiedTokenBySymbol.mock.calls[0][1]?.baseUrl;
  }

  it("follows the chain id when the RPC URL does not name the network", async () => {
    await startServer(
      { STARKNET_RPC_URL: "https://rpc.starknet-testnet.example.com", AVNU_BASE_URL: "", AVNU_PAYMASTER_URL: "" },
      SEPOLIA_CHAIN_ID
    );

    expect(await usdcAddress()).toBe(SEPOLIA_USDC);
    expect(await usdcAddress("USDC.e")).toBe(SEPOLIA_USDC_E);
    // No built-in USDT on Sepolia: looked up on avnu's Sepolia API, not the URL-derived mainnet one.
    expect(await lookUpUsdt()).toBe("https://sepolia.api.avnu.fi");
    expect(stderr.join("")).toContain('"event":"token_service.network_from_chain_id"');
  });

  it("keeps an explicit AVNU_BASE_URL when following the chain id", async () => {
    await startServer(
      { STARKNET_RPC_URL: "https://rpc.starknet-testnet.example.com", AVNU_BASE_URL: "https://avnu.internal.example" },
      SEPOLIA_CHAIN_ID
    );

    expect(await usdcAddress()).toBe(SEPOLIA_USDC);
    expect(await lookUpUsdt()).toBe("https://avnu.internal.example");
  });

  it("keeps the RPC URL's network when the chain id cannot be read", async () => {
    await startServer({}, new Error("connection refused"));

    expect(await usdcAddress()).toBe(SEPOLIA_USDC);
    expect(stderr.join("")).toContain('"event":"token_service.chain_id_unavailable"');
  });

  it("keeps the RPC URL's network for an unknown chain id", async () => {
    await startServer({}, "0x4b4154414e41");

    expect(await usdcAddress()).toBe(SEPOLIA_USDC);
    expect(stderr.join("")).toContain('"event":"token_service.unknown_chain_id"');
  });
});
