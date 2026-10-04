/**
 * The dependency ranges in generated projects are injected at build/test time
 * from this workspace (scripts/template-versions.ts), so these tests check the
 * wiring rather than particular versions: a catalog bump changes the expected
 * values and the actual ones together.
 */
import { describe, expect, it } from "vitest";
import { resolveTemplateVersions } from "../../scripts/template-versions.js";
import { TEMPLATE_DEPENDENCY_SOURCES } from "../template-dependencies.js";
import { generateProject, TEMPLATE_DEPENDENCY_VERSIONS } from "../templates.js";
import type { DeFiProtocol, Network, ProjectConfig, Template } from "../types.js";

function configFor(template: Template, network: Network = "sepolia", defiProtocols: DeFiProtocol[] = []): ProjectConfig {
  return {
    projectName: "versions-check",
    network,
    customRpcUrl: network === "custom" ? "https://rpc.example.com" : undefined,
    template,
    defiProtocols,
    includeExample: "none",
    installDeps: false,
  };
}

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function generatedManifest(config: ProjectConfig): Manifest {
  return JSON.parse(generateProject(config)["package.json"]);
}

/** package.json of every template/network/protocol combination the CLI can emit. */
function allGeneratedManifests(): Array<{ label: string; pkg: Manifest }> {
  const templates: Template[] = ["minimal", "defi", "full"];
  const networks: Network[] = ["mainnet", "sepolia", "custom"];
  const protocolSets: DeFiProtocol[][] = [[], ["avnu"]];
  return templates.flatMap((template) =>
    networks.flatMap((network) =>
      protocolSets.map((protocols) => ({
        label: `${template}/${network}/[${protocols.join(",")}]`,
        pkg: generatedManifest(configFor(template, network, protocols)),
      }))
    )
  );
}

function emittedDependencies(pkg: Manifest): Array<[string, string]> {
  return [...Object.entries(pkg.dependencies ?? {}), ...Object.entries(pkg.devDependencies ?? {})];
}

describe("template dependency versions", () => {
  const v = TEMPLATE_DEPENDENCY_VERSIONS;

  it("injects the ranges the workspace currently declares", () => {
    // Fails if the map is ever hardcoded again, or the define wiring breaks.
    expect(v).toEqual(resolveTemplateVersions());
    expect(Object.keys(v).sort()).toEqual(Object.keys(TEMPLATE_DEPENDENCY_SOURCES).sort());
  });

  it("has an injected range for every package the templates emit", () => {
    for (const { label, pkg } of allGeneratedManifests()) {
      for (const [name, range] of emittedDependencies(pkg)) {
        expect(name in v, `${label}: ${name} has no entry in TEMPLATE_DEPENDENCY_SOURCES`).toBe(true);
        expect(range, `${label}: ${name}`).toBe(v[name as keyof typeof v]);
      }
    }
  });

  it("uses every injected range in at least one template", () => {
    const emitted = new Set(allGeneratedManifests().flatMap(({ pkg }) => emittedDependencies(pkg).map(([n]) => n)));
    expect([...emitted].sort()).toEqual(Object.keys(v).sort());
  });

  it("writes the injected ranges into a generated project's package.json", () => {
    expect(generatedManifest(configFor("minimal"))).toMatchObject({
      dependencies: { dotenv: v.dotenv, starknet: v.starknet },
      devDependencies: { tsx: v.tsx, typescript: v.typescript, "@types/node": v["@types/node"] },
    });
    expect(generatedManifest(configFor("minimal", "sepolia", ["avnu"])).dependencies).toEqual({
      dotenv: v.dotenv,
      starknet: v.starknet,
      "@avnu/avnu-sdk": v["@avnu/avnu-sdk"],
    });
    expect(generatedManifest(configFor("defi")).dependencies).toEqual({
      dotenv: v.dotenv,
      starknet: v.starknet,
      "@avnu/avnu-sdk": v["@avnu/avnu-sdk"],
    });
    expect(generatedManifest(configFor("full"))).toEqual(
      expect.objectContaining({
        dependencies: {
          dotenv: v.dotenv,
          starknet: v.starknet,
          "@avnu/avnu-sdk": v["@avnu/avnu-sdk"],
          zod: v.zod,
        },
        devDependencies: { tsx: v.tsx, typescript: v.typescript, "@types/node": v["@types/node"] },
      })
    );
  });

  it("emits registry ranges a standalone project can install", () => {
    for (const { label, pkg } of allGeneratedManifests()) {
      for (const [name, range] of emittedDependencies(pkg)) {
        expect(range, `${label}: ${name}`).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
        expect(range, `${label}: ${name}`).toMatch(/\d/);
      }
    }
  });
});
