import { describe, it, expect } from "vitest";
import { generateProject } from "../templates.js";
import type { ProjectConfig } from "../types.js";

describe("generateProject", () => {
  it("generates minimal template files", () => {
    const config: ProjectConfig = {
      projectName: "test-agent",
      network: "sepolia",
      template: "minimal",
      defiProtocols: [],
      includeExample: "none",
      installDeps: false,
    };

    const files = generateProject(config);

    expect(files["package.json"]).toBeDefined();
    expect(files["tsconfig.json"]).toBeDefined();
    expect(files[".env.example"]).toBeDefined();
    expect(files[".gitignore"]).toBeDefined();
    expect(files["README.md"]).toBeDefined();
    expect(files["src/index.ts"]).toBeDefined();
    expect(files["src/utils.ts"]).toBeDefined();

    // Minimal should not have config.ts or identity.ts
    expect(files["src/config.ts"]).toBeUndefined();
    expect(files["src/identity.ts"]).toBeUndefined();

    // Check package.json content
    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.name).toBe("test-agent");
    expect(pkg.dependencies.starknet).toBeDefined();
    expect(pkg.dependencies["@avnu/avnu-sdk"]).toBeUndefined();
  });

  it("generates defi template with avnu sdk", () => {
    const config: ProjectConfig = {
      projectName: "defi-bot",
      network: "mainnet",
      template: "defi",
      defiProtocols: ["avnu"],
      includeExample: "none",
      installDeps: false,
    };

    const files = generateProject(config);

    expect(files["src/config.ts"]).toBeDefined();

    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.dependencies["@avnu/avnu-sdk"]).toBeDefined();
  });

  it("generates full template with identity module", () => {
    const config: ProjectConfig = {
      projectName: "full-agent",
      network: "sepolia",
      template: "full",
      defiProtocols: ["avnu"],
      includeExample: "none",
      installDeps: false,
    };

    const files = generateProject(config);

    expect(files["src/identity.ts"]).toBeDefined();
    expect(files["src/config.ts"]).toBeDefined();

    const pkg = JSON.parse(files["package.json"]);
    expect(pkg.dependencies["@avnu/avnu-sdk"]).toBeDefined();
    expect(pkg.dependencies.zod).toBeDefined();
  });

  it("uses correct RPC URL for network", () => {
    const sepoliaConfig: ProjectConfig = {
      projectName: "test",
      network: "sepolia",
      template: "minimal",
      defiProtocols: [],
      includeExample: "none",
      installDeps: false,
    };

    const mainnetConfig: ProjectConfig = {
      ...sepoliaConfig,
      network: "mainnet",
    };

    const sepoliaFiles = generateProject(sepoliaConfig);
    const mainnetFiles = generateProject(mainnetConfig);

    expect(sepoliaFiles[".env.example"]).toContain("sepolia");
    expect(mainnetFiles[".env.example"]).toContain("mainnet");
  });

  it("emits a tsconfig that builds with TypeScript 6", () => {
    const files = generateProject({
      projectName: "test",
      network: "sepolia",
      template: "full",
      defiProtocols: ["avnu"],
      includeExample: "none",
      installDeps: false,
    });

    const tsconfig = JSON.parse(files["tsconfig.json"]);
    // TS 6 errors (TS5011) without an explicit rootDir when outDir is set.
    expect(tsconfig.compilerOptions.rootDir).toBe("./src");
    expect(tsconfig.compilerOptions.types).toEqual(["node"]);
  });

  it.each(["defi", "full"] as const)(
    "%s template loads .env before CONFIG reads process.env",
    (template) => {
      const files = generateProject({
        projectName: "test",
        network: "sepolia",
        template,
        defiProtocols: ["avnu"],
        includeExample: "none",
        installDeps: false,
      });

      // index.ts imports config.ts, and ES module imports are evaluated before
      // the importing module's body, so config.ts must load .env itself.
      const configTs = files["src/config.ts"];
      const loadAt = configTs.indexOf("dotenv.config(");
      expect(loadAt).toBeGreaterThan(-1);
      expect(loadAt).toBeLessThan(configTs.indexOf("export const CONFIG"));
      expect(files["src/index.ts"]).not.toContain("dotenv.config(");
    }
  );

  describe.each(["defi", "full"] as const)("%s config TOKENS", (template) => {
    // Literals rather than the shared constants, so a change there fails these tests.
    const MAINNET_USDC = "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb";
    const MAINNET_USDC_E = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
    const MAINNET_USDT = "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8";
    const SEPOLIA_USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";

    function tokensBlock(network: ProjectConfig["network"]): string {
      const files = generateProject({
        projectName: "test",
        network,
        template,
        defiProtocols: ["avnu"],
        includeExample: "none",
        installDeps: false,
      });
      const match = /export const TOKENS = \{\n([\s\S]*?)\n\};/.exec(files["src/config.ts"]);
      expect(match).not.toBeNull();
      return match![1];
    }

    it("lists Sepolia's native USDC on Sepolia, and no mainnet-only address", () => {
      expect(tokensBlock("sepolia")).toBe(
        [
          '  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",',
          '  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",',
          `  USDC: "${SEPOLIA_USDC}",`,
        ].join("\n")
      );
      const files = generateProject({
        projectName: "test",
        network: "sepolia",
        template,
        defiProtocols: ["avnu"],
        includeExample: "none",
        installDeps: false,
      });
      for (const mainnetOnly of [MAINNET_USDC, MAINNET_USDC_E, MAINNET_USDT]) {
        for (const content of Object.values(files)) {
          expect(content).not.toContain(mainnetOnly);
        }
      }
    });

    it.each(["mainnet", "custom"] as const)("keeps the mainnet tokens on %s", (network) => {
      expect(tokensBlock(network)).toBe(
        [
          '  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",',
          '  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",',
          `  USDC: "${MAINNET_USDC}",`,
          `  USDT: "${MAINNET_USDT}",`,
        ].join("\n")
      );
    });
  });

  it("includes custom RPC URL when provided", () => {
    const config: ProjectConfig = {
      projectName: "test",
      network: "custom",
      customRpcUrl: "https://my-custom-rpc.example.com",
      template: "minimal",
      defiProtocols: [],
      includeExample: "none",
      installDeps: false,
    };

    const files = generateProject(config);

    expect(files[".env.example"]).toContain("my-custom-rpc.example.com");
  });
});
