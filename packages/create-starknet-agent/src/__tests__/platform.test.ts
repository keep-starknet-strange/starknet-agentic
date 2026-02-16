import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  detectPlatforms,
  getPlatformByType,
  isValidPlatformType,
  formatDetectedPlatforms,
} from "../platform.js";
import type { PlatformType } from "../types.js";

// Mock fs module
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      accessSync: vi.fn().mockImplementation(() => {
        throw new Error("ENOENT");
      }),
    },
    accessSync: vi.fn().mockImplementation(() => {
      throw new Error("ENOENT");
    }),
  };
});

describe("platform detection", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all platform env vars
    delete process.env.OPENCLAW_HOME;
    delete process.env.CLAUDE_CODE;
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.CURSOR_AGENT;
    delete process.env.DAYDREAMS_WORKSPACE;
    delete process.env.CI;
    delete process.env.AGENT_INITIATED;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("isValidPlatformType", () => {
    it("returns true for valid platform types", () => {
      const validTypes: PlatformType[] = [
        "openclaw",
        "claude-code",
        "cursor",
        "daydreams",
        "generic-mcp",
        "standalone",
      ];

      for (const type of validTypes) {
        expect(isValidPlatformType(type)).toBe(true);
      }
    });

    it("returns false for invalid platform types", () => {
      const invalidTypes = ["invalid", "vscode", "jetbrains", "", "OPENCLAW"];

      for (const type of invalidTypes) {
        expect(isValidPlatformType(type)).toBe(false);
      }
    });
  });

  describe("detectPlatforms", () => {
    it("always includes standalone as the last option", () => {
      const platforms = detectPlatforms();

      expect(platforms.length).toBeGreaterThan(0);
      expect(platforms[platforms.length - 1].type).toBe("standalone");
    });

    it("detects OpenClaw via OPENCLAW_HOME env var with high confidence", () => {
      process.env.OPENCLAW_HOME = "/home/user/.openclaw";

      const platforms = detectPlatforms();
      const openclaw = platforms.find((p) => p.type === "openclaw");

      expect(openclaw).toBeDefined();
      expect(openclaw?.confidence).toBe("high");
      expect(openclaw?.detectedBy).toContain("OPENCLAW_HOME");
    });

    it("detects Claude Code via CLAUDE_CODE env var with high confidence", () => {
      process.env.CLAUDE_CODE = "true";

      const platforms = detectPlatforms();
      const claudeCode = platforms.find((p) => p.type === "claude-code");

      expect(claudeCode).toBeDefined();
      expect(claudeCode?.confidence).toBe("high");
      expect(claudeCode?.detectedBy).toContain("CLAUDE_CODE");
    });

    it("detects Cursor via CURSOR_SESSION_ID env var with high confidence", () => {
      process.env.CURSOR_SESSION_ID = "session-123";

      const platforms = detectPlatforms();
      const cursor = platforms.find((p) => p.type === "cursor");

      expect(cursor).toBeDefined();
      expect(cursor?.confidence).toBe("high");
      expect(cursor?.detectedBy).toContain("CURSOR_*");
    });

    it("detects Daydreams via DAYDREAMS_WORKSPACE env var with high confidence", () => {
      process.env.DAYDREAMS_WORKSPACE = "/workspace";

      const platforms = detectPlatforms();
      const daydreams = platforms.find((p) => p.type === "daydreams");

      expect(daydreams).toBeDefined();
      expect(daydreams?.confidence).toBe("high");
      expect(daydreams?.detectedBy).toContain("DAYDREAMS_WORKSPACE");
    });

    it("deduplicates platforms by type, keeping highest confidence", () => {
      process.env.OPENCLAW_HOME = "/home/user/.openclaw";

      const platforms = detectPlatforms();
      const openclawPlatforms = platforms.filter((p) => p.type === "openclaw");

      // Should only have one OpenClaw entry
      expect(openclawPlatforms.length).toBe(1);
      // Should be the high confidence one
      expect(openclawPlatforms[0].confidence).toBe("high");
    });

    it("sets isAgentInitiated based on CI env var", () => {
      process.env.CI = "true";

      const platforms = detectPlatforms();

      // All platforms should have isAgentInitiated = true when CI is set
      for (const platform of platforms) {
        expect(platform.isAgentInitiated).toBe(true);
      }
    });
  });

  describe("getPlatformByType", () => {
    it("returns platform for valid type", () => {
      const standalone = getPlatformByType("standalone");

      expect(standalone).toBeDefined();
      expect(standalone?.type).toBe("standalone");
    });

    it("returns platform with correct config paths", () => {
      const standalone = getPlatformByType("standalone");

      expect(standalone?.configPath).toContain("agent.config.ts");
      expect(standalone?.skillsPath).toContain("skills");
      expect(standalone?.secretsPath).toContain(".env");
    });

    it("returns OpenClaw platform when env var is set", () => {
      process.env.OPENCLAW_HOME = "/test/.openclaw";

      const openclaw = getPlatformByType("openclaw");

      expect(openclaw).toBeDefined();
      expect(openclaw?.configPath).toContain("mcp");
      expect(openclaw?.configPath).toContain("starknet.json");
    });
  });

  describe("formatDetectedPlatforms", () => {
    it("formats platforms with confidence icons", () => {
      const platforms = detectPlatforms();
      const formatted = formatDetectedPlatforms(platforms);

      // Should contain the standalone platform at minimum
      expect(formatted).toContain("Standalone");
      expect(formatted).toContain("Type:");
      expect(formatted).toContain("Config:");
    });

    it("includes all platform details in output", () => {
      process.env.OPENCLAW_HOME = "/test/.openclaw";

      const platforms = detectPlatforms();
      const formatted = formatDetectedPlatforms(platforms);

      expect(formatted).toContain("OpenClaw");
      expect(formatted).toContain("Detected by:");
    });
  });
});
