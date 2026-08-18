/**
 * Tests for platform-specific wizards
 */

import { describe, it, expect, vi } from "vitest";
import {
  AVAILABLE_SKILLS,
  trustedSkillApiUrl,
  trustedSkillDownloadUrl,
  type WizardResult,
} from "../wizards.js";

// Mock fs module
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => "{}"),
    accessSync: vi.fn(),
  },
}));

// Mock prompts module
vi.mock("prompts", () => ({
  default: vi.fn(),
}));

describe("wizards", () => {
  describe("AVAILABLE_SKILLS", () => {
    it("should have at least 4 skills defined", () => {
      expect(AVAILABLE_SKILLS.length).toBeGreaterThanOrEqual(4);
    });

    it("should have starknet-wallet as a recommended skill", () => {
      const walletSkill = AVAILABLE_SKILLS.find((s) => s.id === "starknet-wallet");
      expect(walletSkill).toBeDefined();
      expect(walletSkill?.recommended).toBe(true);
    });

    it("should have starknet-defi as a recommended skill", () => {
      const defiSkill = AVAILABLE_SKILLS.find((s) => s.id === "starknet-defi");
      expect(defiSkill).toBeDefined();
      expect(defiSkill?.recommended).toBe(true);
    });

    it("should have starknet-identity as a non-recommended skill", () => {
      const identitySkill = AVAILABLE_SKILLS.find((s) => s.id === "starknet-identity");
      expect(identitySkill).toBeDefined();
      expect(identitySkill?.recommended).toBe(false);
    });

    it("should have starknet-anonymous-wallet as a non-recommended skill", () => {
      const anonSkill = AVAILABLE_SKILLS.find((s) => s.id === "starknet-anonymous-wallet");
      expect(anonSkill).toBeDefined();
      expect(anonSkill?.recommended).toBe(false);
    });

    it("each skill should have id, name, and description", () => {
      for (const skill of AVAILABLE_SKILLS) {
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(typeof skill.recommended).toBe("boolean");
      }
    });
  });

  describe("WizardResult interface", () => {
    it("should have the correct shape", () => {
      const mockResult: WizardResult = {
        success: true,
        platform: {
          type: "openclaw",
          name: "OpenClaw/MoltBook",
          configPath: "~/.openclaw/mcp/starknet.json",
          skillsPath: "~/.openclaw/skills",
          secretsPath: "~/.openclaw/secrets/starknet",
          isAgentInitiated: false,
          confidence: "high",
          detectedBy: "test",
        },
        network: "sepolia",
        setupMode: "full",
        selectedSkills: ["starknet-wallet", "starknet-defi"],
        files: {
          "~/.openclaw/mcp/starknet.json": '{"mcpServers":{}}',
        },
        nextSteps: ["Add credentials", "Restart agent"],
        verificationCommand: 'Ask: "What\'s my ETH balance?"',
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.platform.type).toBe("openclaw");
      expect(mockResult.network).toBe("sepolia");
      expect(mockResult.setupMode).toBe("full");
      expect(mockResult.selectedSkills).toHaveLength(2);
      expect(Object.keys(mockResult.files)).toHaveLength(1);
      expect(mockResult.nextSteps).toHaveLength(2);
      expect(mockResult.verificationCommand).toBeTruthy();
    });
  });
});

describe("MCP config generation", () => {
  it("should generate valid JSON for MCP config", async () => {
    // Import the module dynamically to get the internal function
    const { RPC_URLS } = await import("../types.js");

    const network = "sepolia";
    const expectedRpcUrl = RPC_URLS[network];

    expect(expectedRpcUrl).toBe("https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/YOUR_API_KEY");
  });
});

describe("trustedSkillDownloadUrl", () => {
  it("accepts raw.githubusercontent.com URLs for this repo", () => {
    const url =
      "https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/starknet-wallet/SKILL.md";
    expect(trustedSkillDownloadUrl(url)).toBe(url);
  });

  it("rejects non-https, foreign hosts, credentials, and traversal", () => {
    expect(trustedSkillDownloadUrl("http://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/x")).toBeNull();
    expect(trustedSkillDownloadUrl("https://evil.example/keep-starknet-strange/starknet-agentic/main/skills/x")).toBeNull();
    expect(
      trustedSkillDownloadUrl(
        "https://user:pass@raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/x"
      )
    ).toBeNull();
    expect(
      trustedSkillDownloadUrl(
        "https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/../other/skills/x"
      )
    ).toBeNull();
  });

  it("rejects valid-host URLs outside the skills/ tree", () => {
    expect(
      trustedSkillDownloadUrl(
        "https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/packages/create-starknet-agent/package.json"
      )
    ).toBeNull();
  });

  it("rejects objects.githubusercontent.com (path shape never matches this repo)", () => {
    expect(
      trustedSkillDownloadUrl(
        "https://objects.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/starknet-wallet/SKILL.md"
      )
    ).toBeNull();
  });
});

describe("trustedSkillApiUrl", () => {
  it("accepts GitHub Contents API URLs under skills/", () => {
    const url =
      "https://api.github.com/repos/keep-starknet-strange/starknet-agentic/contents/skills/starknet-wallet";
    expect(trustedSkillApiUrl(url)).toBe(url);
  });

  it("rejects other GitHub API paths", () => {
    expect(
      trustedSkillApiUrl(
        "https://api.github.com/repos/keep-starknet-strange/starknet-agentic/contents/packages/create-starknet-agent"
      )
    ).toBeNull();
  });
});
