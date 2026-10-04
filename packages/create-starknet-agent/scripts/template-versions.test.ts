import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TEMPLATE_DEPENDENCY_SOURCES } from "../src/template-dependencies.js";
import {
  findWorkspaceRoot,
  parseCatalog,
  resolveTemplateVersions,
  templateVersionDefines,
  TEMPLATE_VERSIONS_DEFINE,
} from "./template-versions.js";

describe("parseCatalog", () => {
  it("reads quoted and unquoted entries, skipping comments and blank lines", () => {
    const yaml = [
      "packages:",
      "  - 'packages/*'",
      "",
      "# Shared ranges.",
      "catalog:",
      "  '@types/node': ^26.6.3",
      '  "@scope/pkg": "~1.2.3"',
      "",
      "  # comment inside the mapping",
      "  starknet: ^10.8.0   # trailing comment",
      "  range: '>=1.0.0 <2.0.0'",
      "",
      "catalogs:",
      "  legacy:",
      "    starknet: ^9.0.0",
      "overrides:",
      "  starknet: 1.0.0",
    ].join("\n");
    expect(parseCatalog(yaml)).toEqual({
      "@types/node": "^26.6.3",
      "@scope/pkg": "~1.2.3",
      starknet: "^10.8.0",
      range: ">=1.0.0 <2.0.0",
    });
  });

  it("handles CRLF line endings", () => {
    expect(parseCatalog("catalog:\r\n  zod: ^4.6.5\r\n")).toEqual({ zod: "^4.6.5" });
  });

  it("returns an empty map when there is no catalog", () => {
    expect(parseCatalog("packages:\n  - 'packages/*'\n")).toEqual({});
  });

  it("throws on a line it cannot read instead of dropping it", () => {
    expect(() => parseCatalog("catalog:\n  nested:\n    deep: ^1.0.0\n")).toThrow(/Unsupported line/);
    expect(() => parseCatalog("catalog:\n  - starknet\n")).toThrow(/Unsupported line/);
  });

  it("reads the root pnpm-workspace.yaml", () => {
    const catalog = parseCatalog(readFileSync(join(findWorkspaceRoot(), "pnpm-workspace.yaml"), "utf8"));
    expect(catalog.starknet).toMatch(/\d+\.\d+\.\d+/);
    expect(catalog.typescript).toMatch(/\d+\.\d+\.\d+/);
  });
});

describe("resolveTemplateVersions", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Writes a minimal workspace: a catalog plus the packages the sources point at. */
  function fixture(catalog: Record<string, string>, packages: Record<string, Record<string, unknown>> = {}): string {
    const root = mkdtempSync(join(tmpdir(), "csa-template-versions-"));
    dirs.push(root);
    const lines = Object.entries(catalog).map(([name, range]) => `  '${name}': ${range}`);
    writeFileSync(join(root, "pnpm-workspace.yaml"), ["packages:", "  - 'packages/*'", "catalog:", ...lines, ""].join("\n"));
    for (const [dir, manifest] of Object.entries(packages)) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "package.json"), JSON.stringify(manifest));
    }
    return root;
  }

  const baseCatalog = {
    "@types/node": "^26.6.3",
    dotenv: "^18.0.4",
    starknet: "^10.8.0",
    tsx: "^4.23.15",
    typescript: "^6.0.3",
    zod: "^4.6.5",
  };
  const mcpServer = { dependencies: { "@avnu/avnu-sdk": "^4.2.0", starknet: "catalog:" } };

  it("takes catalog entries from the catalog and the rest from the named workspace package", () => {
    const root = fixture(baseCatalog, { "packages/starknet-mcp-server": mcpServer });
    expect(resolveTemplateVersions(root)).toEqual({ ...baseCatalog, "@avnu/avnu-sdk": "^4.2.0" });
  });

  it("follows a catalog or workspace-package bump with no other change", () => {
    const root = fixture(
      { ...baseCatalog, starknet: "^10.9.1", zod: "^4.7.0" },
      { "packages/starknet-mcp-server": { dependencies: { "@avnu/avnu-sdk": "^4.3.0" } } }
    );
    expect(resolveTemplateVersions(root)).toMatchObject({
      starknet: "^10.9.1",
      zod: "^4.7.0",
      "@avnu/avnu-sdk": "^4.3.0",
    });
  });

  it("resolves a workspace package's catalog: specifier through the catalog", () => {
    const root = fixture(
      { ...baseCatalog, "@avnu/avnu-sdk": "^4.5.0" },
      { "packages/starknet-mcp-server": { dependencies: { "@avnu/avnu-sdk": "catalog:" } } }
    );
    expect(resolveTemplateVersions(root)["@avnu/avnu-sdk"]).toBe("^4.5.0");
  });

  it("fails the build when a catalog entry is missing", () => {
    const { zod: _zod, ...withoutZod } = baseCatalog;
    const root = fixture(withoutZod, { "packages/starknet-mcp-server": mcpServer });
    expect(() => resolveTemplateVersions(root)).toThrow(/zod: no entry in the pnpm-workspace.yaml catalog/);
  });

  it("fails the build when the workspace package no longer declares the dependency", () => {
    const root = fixture(baseCatalog, { "packages/starknet-mcp-server": { dependencies: {} } });
    expect(() => resolveTemplateVersions(root)).toThrow(/@avnu\/avnu-sdk: not declared/);
  });

  it("rejects ranges a project outside the workspace cannot install", () => {
    const root = fixture(baseCatalog, {
      "packages/starknet-mcp-server": { dependencies: { "@avnu/avnu-sdk": "workspace:*" } },
    });
    expect(() => resolveTemplateVersions(root)).toThrow(/not a registry range/);
  });

  it("produces a define entry whose value is the JSON of the resolved map", () => {
    const root = fixture(baseCatalog, { "packages/starknet-mcp-server": mcpServer });
    const defines = templateVersionDefines(root);
    expect(Object.keys(defines)).toEqual([TEMPLATE_VERSIONS_DEFINE]);
    expect(JSON.parse(defines[TEMPLATE_VERSIONS_DEFINE])).toEqual(resolveTemplateVersions(root));
  });

  it("resolves every source against this repository", () => {
    const versions = resolveTemplateVersions();
    expect(Object.keys(versions).sort()).toEqual(Object.keys(TEMPLATE_DEPENDENCY_SOURCES).sort());
  });
});
