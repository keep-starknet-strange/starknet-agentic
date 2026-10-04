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
