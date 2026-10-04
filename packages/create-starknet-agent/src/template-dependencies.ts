/**
 * Dependencies that generated projects declare, and where this workspace keeps
 * the version range for each one.
 *
 * - `"catalog"`: the entry of the same name in the root `pnpm-workspace.yaml`
 *   catalog.
 * - `{ workspacePackage }`: the range that workspace package (a directory
 *   relative to the repository root) declares in its own `package.json`, for
 *   dependencies that are not in the catalog.
 *
 * `scripts/template-versions.ts` resolves these when the CLI is built or
 * tested and injects the result as `__TEMPLATE_DEPENDENCY_VERSIONS__`, so a
 * Dependabot bump of the source range reaches generated projects with no
 * further edit. Only types from this module are imported at runtime, so it is
 * not part of the published bundle.
 */
export const TEMPLATE_DEPENDENCY_SOURCES = {
  "@avnu/avnu-sdk": { workspacePackage: "packages/starknet-mcp-server" },
  "@types/node": "catalog",
  dotenv: "catalog",
  starknet: "catalog",
  tsx: "catalog",
  typescript: "catalog",
  zod: "catalog",
} as const satisfies Record<string, TemplateDependencySource>;

export type TemplateDependencySource = "catalog" | { readonly workspacePackage: string };

export type TemplateDependency = keyof typeof TEMPLATE_DEPENDENCY_SOURCES;

export type TemplateDependencyVersions = Readonly<Record<TemplateDependency, string>>;
