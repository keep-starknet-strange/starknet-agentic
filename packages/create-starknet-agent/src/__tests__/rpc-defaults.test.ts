import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUBLIC_RPC_URLS } from "@starknetfoundation/starknet-agentic-shared/constants";
import { DEFAULT_E2E_RPC_URL, resolveE2ERpcUrl } from "../verify.js";
import { generateProject } from "../templates.js";
import { RPC_URLS } from "../types.js";

// Public endpoints that have shut down: Blast API answers HTTP 403 and the
// rpc.starknet(-testnet).lava.build endpoints answer HTTP 410.
const DEAD_RPC_HOSTS = ["blastapi.io", "lava.build"];

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : listFiles(full);
    return [full];
  });
}

describe("fallback RPC URLs", () => {
  it.each(Object.entries(PUBLIC_RPC_URLS))("%s fallback is a keyless HTTPS endpoint on RPC spec 0.10", (_network, url) => {
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.pathname).toMatch(/\/rpc\/v0_10$/);
    expect(url).not.toMatch(/YOUR_API_KEY|api[_-]?key/i);
    for (const host of DEAD_RPC_HOSTS) {
      expect(parsed.hostname).not.toContain(host);
    }
  });

  it("names each network in the URL, so network detection still works", () => {
    expect(PUBLIC_RPC_URLS.mainnet).toContain("mainnet");
    expect(PUBLIC_RPC_URLS.sepolia).toContain("sepolia");
  });

  it("verify's end-to-end check falls back to the public Sepolia RPC, not Blast", () => {
    expect(DEFAULT_E2E_RPC_URL).toBe(PUBLIC_RPC_URLS.sepolia);
    expect(resolveE2ERpcUrl({})).toBe(PUBLIC_RPC_URLS.sepolia);
    expect(resolveE2ERpcUrl({ STARKNET_RPC_URL: "" })).toBe(PUBLIC_RPC_URLS.sepolia);
    expect(resolveE2ERpcUrl({ STARKNET_RPC_URL: "https://rpc.example.com" })).toBe("https://rpc.example.com");
  });

  it("no scaffolder source or doc points at a shut-down public RPC", () => {
    const files = [
      ...listFiles(path.join(packageDir, "src")),
      ...listFiles(path.join(packageDir, "docs")),
      path.join(packageDir, "README.md"),
    ];
    const offenders = files.filter((file) => {
      const content = fs.readFileSync(file, "utf8");
      return DEAD_RPC_HOSTS.some((host) => content.includes(host));
    });
    expect(offenders).toEqual([]);
  });
});

describe("default RPC in generated projects", () => {
  it("uses the keyless public endpoints, not a provider URL with a key placeholder", () => {
    expect(RPC_URLS).toEqual({ mainnet: PUBLIC_RPC_URLS.mainnet, sepolia: PUBLIC_RPC_URLS.sepolia });
  });

  it.each(["mainnet", "sepolia"] as const)("%s projects get a working STARKNET_RPC_URL out of the box", (network) => {
    for (const template of ["minimal", "defi", "full"] as const) {
      const files = generateProject({
        projectName: "sample",
        network,
        template,
        defiProtocols: [],
        includeExample: "none",
        installDeps: false,
      });
      const all = Object.values(files).join("\n");
      expect(all, template).not.toMatch(/YOUR_API_KEY/);
      expect(files[".env.example"], template).toContain(`STARKNET_RPC_URL=${PUBLIC_RPC_URLS[network]}`);
    }
  });
});
