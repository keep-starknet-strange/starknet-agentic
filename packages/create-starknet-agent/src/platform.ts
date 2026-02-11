/**
 * Platform detection module for create-starknet-agent
 *
 * Detects which agent platform the CLI is running inside and provides
 * appropriate configuration paths for each platform.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DetectedPlatform, PlatformType, DetectionConfidence } from "./types.js";

/**
 * Expand home directory shorthand in paths
 */
function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Check if a path exists (file or directory)
 */
function pathExists(filePath: string): boolean {
  try {
    fs.accessSync(expandHome(filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running in non-interactive mode (agent-initiated)
 */
function isAgentInitiated(): boolean {
  // Check TTY - if no TTY, likely agent-initiated
  if (!process.stdin.isTTY) {
    return true;
  }
  // Check common CI/agent environment variables
  if (process.env.CI || process.env.AGENT_INITIATED) {
    return true;
  }
  return false;
}

/**
 * Platform factory functions
 */

function createOpenClawPlatform(
  confidence: DetectionConfidence,
  detectedBy: string
): DetectedPlatform {
  const homeDir = process.env.OPENCLAW_HOME || expandHome("~/.openclaw");
  return {
    type: "openclaw",
    name: "OpenClaw/MoltBook",
    configPath: path.join(homeDir, "mcp", "starknet.json"),
    skillsPath: path.join(homeDir, "skills"),
    secretsPath: path.join(homeDir, "secrets", "starknet"),
    isAgentInitiated: isAgentInitiated(),
    confidence,
    detectedBy,
  };
}

function createClaudeCodePlatform(
  confidence: DetectionConfidence,
  detectedBy: string
): DetectedPlatform {
  // Claude Code uses project-local .claude directory or user-level config
  const projectClaudeDir = path.join(process.cwd(), ".claude");
  const userClaudeDir = expandHome("~/.claude");

  // Prefer project-local config if it exists
  const configDir = pathExists(projectClaudeDir) ? projectClaudeDir : userClaudeDir;

  return {
    type: "claude-code",
    name: "Claude Code",
    configPath: path.join(configDir, "settings.json"),
    skillsPath: path.join(configDir, "skills"),
    secretsPath: path.join(process.cwd(), ".env"),
    isAgentInitiated: isAgentInitiated(),
    confidence,
    detectedBy,
  };
}

function createCursorPlatform(
  confidence: DetectionConfidence,
  detectedBy: string
): DetectedPlatform {
  const cursorDir = path.join(process.cwd(), ".cursor");
  return {
    type: "cursor",
    name: "Cursor",
    configPath: path.join(cursorDir, "mcp.json"),
    skillsPath: path.join(cursorDir, "skills"),
    secretsPath: path.join(process.cwd(), ".env"),
    isAgentInitiated: isAgentInitiated(),
    confidence,
    detectedBy,
  };
}

function createDaydreamsPlatform(
  confidence: DetectionConfidence,
  detectedBy: string
): DetectedPlatform {
  return {
    type: "daydreams",
    name: "Daydreams",
    configPath: path.join(process.cwd(), "daydreams.config.json"),
    skillsPath: path.join(process.cwd(), "skills"),
    secretsPath: path.join(process.cwd(), ".env"),
    isAgentInitiated: isAgentInitiated(),
    confidence,
    detectedBy,
  };
}

function createGenericMcpPlatform(
  confidence: DetectionConfidence,
  detectedBy: string
): DetectedPlatform {
  // Check for mcp.json first, then claude_desktop_config.json
  let configPath = path.join(process.cwd(), "mcp.json");

  // Check for Claude Desktop config in standard locations
  const claudeDesktopPaths = [
    expandHome("~/Library/Application Support/Claude/claude_desktop_config.json"), // macOS
    expandHome("~/.config/claude/claude_desktop_config.json"), // Linux
    expandHome("~/AppData/Roaming/Claude/claude_desktop_config.json"), // Windows
  ];

  for (const desktopPath of claudeDesktopPaths) {
    if (pathExists(desktopPath)) {
      configPath = desktopPath;
      break;
    }
  }

  return {
    type: "generic-mcp",
    name: "Generic MCP",
    configPath,
    secretsPath: path.join(process.cwd(), ".env"),
    isAgentInitiated: isAgentInitiated(),
    confidence,
    detectedBy,
  };
}

function createStandalonePlatform(): DetectedPlatform {
  return {
    type: "standalone",
    name: "Standalone Project",
    configPath: path.join(process.cwd(), "agent.config.ts"),
    skillsPath: path.join(process.cwd(), "src", "skills"),
    secretsPath: path.join(process.cwd(), ".env"),
    isAgentInitiated: isAgentInitiated(),
    confidence: "low",
    detectedBy: "default fallback",
  };
}

/**
 * Detect all platforms that may be present, ordered by confidence
 *
 * @returns Array of detected platforms, highest confidence first
 */
export function detectPlatforms(): DetectedPlatform[] {
  const detected: DetectedPlatform[] = [];

  // 1. Check explicit environment variables (highest confidence)
  if (process.env.OPENCLAW_HOME) {
    detected.push(createOpenClawPlatform("high", "OPENCLAW_HOME env var"));
  }
  if (process.env.CLAUDE_CODE) {
    detected.push(createClaudeCodePlatform("high", "CLAUDE_CODE env var"));
  }
  if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_AGENT) {
    detected.push(createCursorPlatform("high", "CURSOR_* env var"));
  }
  if (process.env.DAYDREAMS_WORKSPACE) {
    detected.push(createDaydreamsPlatform("high", "DAYDREAMS_WORKSPACE env var"));
  }

  // 2. Check config file/directory existence (medium confidence)
  if (pathExists("~/.openclaw/")) {
    detected.push(createOpenClawPlatform("medium", "~/.openclaw/ directory"));
  }
  if (pathExists("moltbook.config.json") || pathExists("moltbook.config.ts")) {
    detected.push(createOpenClawPlatform("medium", "moltbook.config.* file"));
  }

  if (pathExists(".claude/settings.json") || pathExists(".claude/")) {
    detected.push(createClaudeCodePlatform("medium", ".claude/ directory"));
  }

  if (pathExists(".cursor/")) {
    detected.push(createCursorPlatform("medium", ".cursor/ directory"));
  }

  if (pathExists("daydreams.config.json") || pathExists("daydreams.config.ts")) {
    detected.push(createDaydreamsPlatform("medium", "daydreams.config.* file"));
  }

  // 3. Check for generic MCP config files
  if (pathExists("mcp.json")) {
    detected.push(createGenericMcpPlatform("medium", "mcp.json file"));
  }

  // Check for Claude Desktop config
  const claudeDesktopPaths = [
    "~/Library/Application Support/Claude/claude_desktop_config.json",
    "~/.config/claude/claude_desktop_config.json",
    "~/AppData/Roaming/Claude/claude_desktop_config.json",
  ];
  for (const desktopPath of claudeDesktopPaths) {
    if (pathExists(desktopPath)) {
      detected.push(createGenericMcpPlatform("medium", "claude_desktop_config.json"));
      break;
    }
  }

  // 4. Deduplicate by platform type, keeping first occurrence (highest confidence)
  const seen = new Set<PlatformType>();
  const unique = detected.filter((p) => {
    if (seen.has(p.type)) return false;
    seen.add(p.type);
    return true;
  });

  // 5. Always include standalone as final option
  unique.push(createStandalonePlatform());

  return unique;
}

/**
 * Get a specific platform by type
 * Returns the platform configuration even if not detected (with low confidence)
 *
 * @param type Platform type to get
 * @returns Platform configuration or undefined if not a valid type
 */
export function getPlatformByType(type: PlatformType): DetectedPlatform | undefined {
  // First check if it's in detected platforms (higher confidence)
  const detected = detectPlatforms();
  const found = detected.find((p) => p.type === type);
  if (found) {
    return found;
  }

  // If not detected, create a default config for the platform type
  switch (type) {
    case "openclaw":
      return createOpenClawPlatform("low", "user specified");
    case "claude-code":
      return createClaudeCodePlatform("low", "user specified");
    case "cursor":
      return createCursorPlatform("low", "user specified");
    case "daydreams":
      return createDaydreamsPlatform("low", "user specified");
    case "generic-mcp":
      return createGenericMcpPlatform("low", "user specified");
    case "standalone":
      return createStandalonePlatform();
    default:
      return undefined;
  }
}

/**
 * Get display name for a platform
 */
export function getPlatformDisplayName(platform: DetectedPlatform): string {
  const confidenceLabel =
    platform.confidence === "high"
      ? " (detected)"
      : platform.confidence === "medium"
        ? " (found)"
        : "";
  return `${platform.name}${confidenceLabel}`;
}

/**
 * Format detected platforms for display
 *
 * @param platforms Array of detected platforms
 * @returns Formatted string for CLI output
 */
export function formatDetectedPlatforms(platforms: DetectedPlatform[]): string {
  const lines: string[] = [];

  for (const platform of platforms) {
    const confidenceIcon =
      platform.confidence === "high"
        ? "●"
        : platform.confidence === "medium"
          ? "◐"
          : "○";
    lines.push(`  ${confidenceIcon} ${platform.name}`);
    lines.push(`    Type: ${platform.type}`);
    lines.push(`    Config: ${platform.configPath}`);
    if (platform.skillsPath) {
      lines.push(`    Skills: ${platform.skillsPath}`);
    }
    if (platform.secretsPath) {
      lines.push(`    Secrets: ${platform.secretsPath}`);
    }
    lines.push(`    Detected by: ${platform.detectedBy}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Validate platform type string
 */
export function isValidPlatformType(type: string): type is PlatformType {
  return ["openclaw", "claude-code", "cursor", "daydreams", "generic-mcp", "standalone"].includes(
    type
  );
}
