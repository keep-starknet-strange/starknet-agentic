import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Token addresses
const TOKENS = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// Mock environment variables before any imports
const mockEnv = {
  STARKNET_RPC_URL: "https://starknet-sepolia.example.com",
  STARKNET_ACCOUNT_ADDRESS: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  // Non-secret placeholder; tests only require a syntactically-valid string.
  STARKNET_PRIVATE_KEY: "0x1",
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
const mockBalanceOf = vi.fn();
const mockValidateAndParseAddress = vi.fn((addr: string) =>
  addr.toLowerCase().padStart(66, "0x".padEnd(66, "0"))
);

vi.mock("starknet", () => ({
  Account: vi.fn().mockImplementation(() => ({
    address: mockEnv.STARKNET_ACCOUNT_ADDRESS,
    execute: mockExecute,
    estimateInvokeFee: mockEstimateInvokeFee,
    estimatePaymasterTransactionFee: mockEstimatePaymasterTransactionFee,
    executePaymasterTransaction: mockExecutePaymasterTransaction,
  })),
  RpcProvider: vi.fn().mockImplementation(() => ({
    callContract: mockCallContract,
    waitForTransaction: mockWaitForTransaction,
  })),
  PaymasterRpc: vi.fn().mockImplementation((opts) => opts || {}),
  Contract: vi.fn().mockImplementation(() => ({
    balanceOf: mockBalanceOf,
    get_balances: vi.fn(),
  })),
  CallData: {
    compile: vi.fn((data) => Object.values(data)),
  },
  cairo: {
    uint256: vi.fn((n) => ({ low: n.toString(), high: "0" })),
  },
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
    stringFromByteArray: vi.fn((ba) => "TEST"),
  },
  // Minimal selector helper used by receipt parsers.
  hash: {
    getSelectorFromName: vi.fn((name: string) => `selector:${name}`),
  },
}));

// Mock avnu-sdk
const mockGetQuotes = vi.fn();
const mockQuoteToCalls = vi.fn();

vi.mock("@avnu/avnu-sdk", () => ({
  getQuotes: mockGetQuotes,
  quoteToCalls: mockQuoteToCalls,
  fetchTokenByAddress: vi.fn(),
  fetchVerifiedTokenBySymbol: vi.fn(),
}));

// Mock x402-starknet
const mockCreateStarknetPaymentSignatureHeader = vi.fn();

vi.mock("@starknet-agentic/x402-starknet", () => ({
  createStarknetPaymentSignatureHeader: mockCreateStarknetPaymentSignatureHeader,
}));

// Mock MCP SDK
const mockServerConnect = vi.fn();
let capturedToolHandler: ((request: any) => Promise<any>) | null = null;
let capturedListHandler: (() => Promise<any>) | null = null;

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn((schema: any, handler: any) => {
      if (schema.method === "tools/list") {
        capturedListHandler = handler;
      } else if (schema.method === "tools/call") {
        capturedToolHandler = handler;
      }
    }),
    connect: mockServerConnect,
  })),
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

// Suppress server startup messages globally for this test file
const originalConsoleError = console.error;

describe("MCP Tool Handlers", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockEstimatePaymasterTransactionFee.mockResolvedValue({
      suggested_max_fee_in_gas_token: "0",
    });
    capturedToolHandler = null;
    capturedListHandler = null;

    // Set environment variables
    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }

    // Suppress server startup message
    console.error = vi.fn();

    // Reset module cache and re-import to capture handlers
    vi.resetModules();

    // Import the server module to trigger handler registration
    await import("../../src/index.js");

    // Restore console.error for test assertions
    console.error = originalConsoleError;
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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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
      mockWaitForTransaction.mockResolvedValue({});

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

      expect(mockEstimateInvokeFee).toHaveBeenCalledWith({
        contractAddress: "0x555",
        entrypoint: "call_with_args",
        calldata: ["0x1", "0x2"],
      });
    });
  });

  describe("x402_starknet_sign_payment_required", () => {
    it("signs payment and returns header", async () => {
      mockCreateStarknetPaymentSignatureHeader.mockResolvedValue({
        headerValue: "base64-encoded-signature",
        payload: { amount: "100", token: TOKENS.USDC },
      });

      const paymentHeader = Buffer.from(JSON.stringify({
        version: "1",
        amount: "100",
        token: TOKENS.USDC,
      })).toString("base64");

      const response = await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: paymentHeader,
      });

      const result = parseResponse(response);
      expect(result.paymentSignatureHeader).toBe("base64-encoded-signature");
      expect(result.payload).toBeDefined();
    });

    it("uses env defaults when params not provided", async () => {
      mockCreateStarknetPaymentSignatureHeader.mockResolvedValue({
        headerValue: "sig",
        payload: {},
      });

      await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
      });

      expect(mockCreateStarknetPaymentSignatureHeader).toHaveBeenCalledWith({
        paymentRequiredHeader: "test",
        rpcUrl: mockEnv.STARKNET_RPC_URL,
        accountAddress: mockEnv.STARKNET_ACCOUNT_ADDRESS,
        privateKey: mockEnv.STARKNET_PRIVATE_KEY,
      });
    });

    it("ignores extra params and always signs with env-configured account", async () => {
      mockCreateStarknetPaymentSignatureHeader.mockResolvedValue({
        headerValue: "sig",
        payload: {},
      });

      await callTool("x402_starknet_sign_payment_required", {
        paymentRequiredHeader: "test",
        // These are intentionally ignored to avoid signing arbitrary key material.
        rpcUrl: "https://custom.rpc.url",
        accountAddress: "0xcustom",
        privateKey: "0xprivate",
      });

      expect(mockCreateStarknetPaymentSignatureHeader).toHaveBeenCalledWith({
        paymentRequiredHeader: "test",
        rpcUrl: mockEnv.STARKNET_RPC_URL,
        accountAddress: mockEnv.STARKNET_ACCOUNT_ADDRESS,
        privateKey: mockEnv.STARKNET_PRIVATE_KEY,
      });
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

describe("Tool list", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedToolHandler = null;
    capturedListHandler = null;

    for (const [key, value] of Object.entries(mockEnv)) {
      process.env[key] = value;
    }

    // Suppress server startup message
    console.error = vi.fn();

    vi.resetModules();
    await import("../../src/index.js");

    // Restore console.error
    console.error = originalConsoleError;
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

    expect(response.tools).toHaveLength(10);
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).toContain("starknet_get_balance");
    expect(toolNames).toContain("starknet_get_balances");
    expect(toolNames).toContain("starknet_transfer");
    expect(toolNames).toContain("starknet_call_contract");
    expect(toolNames).toContain("starknet_invoke_contract");
    expect(toolNames).toContain("starknet_swap");
    expect(toolNames).toContain("starknet_get_quote");
    expect(toolNames).toContain("starknet_register_agent");
    expect(toolNames).toContain("starknet_estimate_fee");
    expect(toolNames).toContain("x402_starknet_sign_payment_required");
  });

  it("includes deploy tool when factory env is set", async () => {
    process.env.AGENT_ACCOUNT_FACTORY_ADDRESS =
      "0x0fabcde01234567890abcdef01234567890abcdef01234567890abcdef01234";

    console.error = vi.fn();
    vi.resetModules();
    await import("../../src/index.js");
    console.error = originalConsoleError;

    if (!capturedListHandler) {
      throw new Error("List handler not captured");
    }

    const response = await capturedListHandler();
    const toolNames = response.tools.map((t: any) => t.name);
    expect(toolNames).toContain("starknet_deploy_agent_account");
    expect(response.tools).toHaveLength(11);

    delete process.env.AGENT_ACCOUNT_FACTORY_ADDRESS;
  });
});
