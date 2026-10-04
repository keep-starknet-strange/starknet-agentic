/**
 * Resolves the dependency ranges create-starknet-agent writes into generated
 * projects from this workspace, at build and test time.
 *
 * tsup.config.ts and vitest.config.ts pass `templateVersionDefines()` to
 * `define`, which replaces `__TEMPLATE_DEPENDENCY_VERSIONS__` in
 * src/templates.ts with a literal object. The published bundle therefore
 * carries concrete ranges, and they always equal what the workspace uses:
 * a catalog bump in pnpm-workspace.yaml (or a range bump in the workspace
 * package named in src/template-dependencies.ts) changes the next build's
 * output with nothing else to edit.
 *
 * Kept dependency-free: the catalog is a flat `name: range` mapping, which
 * `parseCatalog` reads line by line instead of pulling in a YAML parser.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEMPLATE_DEPENDENCY_SOURCES,
  type TemplateDependency,
  type TemplateDependencySource,
  type TemplateDependencyVersions,
} from "../src/template-dependencies.js";

/** Name of the constant src/templates.ts reads the resolved map from. */
export const TEMPLATE_VERSIONS_DEFINE = "__TEMPLATE_DEPENDENCY_VERSIONS__";

/**
 * Reads the default `catalog:` mapping from the text of a pnpm-workspace.yaml.
 *
 * Supports the subset pnpm catalogs use: one `name: range` pair per line,
 * names and ranges optionally single- or double-quoted, blank lines and `#`
 * comments. Throws on any other line inside the mapping rather than skipping
 * it, so an unsupported layout fails the build instead of dropping a version.
 * Named catalogs (`catalogs:`) are not read.
 */
export function parseCatalog(yaml: string): Record<string, string> {
  const catalog: Record<string, string> = {};
  let inCatalog = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^catalog:\s*(#.*)?$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (!inCatalog || /^\s*(#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break; // the next top-level key ends the mapping
    const match = line.match(
      /^\s+(?:'([^']+)'|"([^"]+)"|([^\s'"#:]+))\s*:\s+(?:'([^']+)'|"([^"]+)"|([^\s'"#][^#]*?))\s*(?:#.*)?$/
    );
    if (!match) {
      throw new Error(`Unsupported line in the pnpm-workspace.yaml catalog: "${line.trim()}"`);
    }
    const name = match[1] ?? match[2] ?? match[3];
    catalog[name] = match[4] ?? match[5] ?? match[6];
  }
  return catalog;
}

/** Walks up from `startDir` to the directory that holds pnpm-workspace.yaml. */
export function findWorkspaceRoot(startDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = startDir;
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No pnpm-workspace.yaml found above ${startDir}`);
    }
    dir = parent;
  }
  return dir;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function resolveOne(
  name: TemplateDependency,
  source: TemplateDependencySource,
  catalog: Record<string, string>,
  repoRoot: string
): string {
  if (source === "catalog") {
    const range = catalog[name];
    if (!range) throw new Error(`${name}: no entry in the pnpm-workspace.yaml catalog`);
    return range;
  }
  const manifestPath = join(repoRoot, source.workspacePackage, "package.json");
  const manifest = readJson(manifestPath);
  let range: string | undefined;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    range ??= (manifest[field] as Record<string, string> | undefined)?.[name];
  }
  if (!range) throw new Error(`${name}: not declared in ${manifestPath}`);
  // The package may later move the dependency into the default catalog.
  if (range === "catalog:") {
    const catalogRange = catalog[name];
    if (!catalogRange) throw new Error(`${name}: ${manifestPath} uses "catalog:" but the catalog has no entry`);
    return catalogRange;
  }
  return range;
}

/**
 * Resolves every dependency in TEMPLATE_DEPENDENCY_SOURCES to the range this
 * workspace declares. Throws when one is missing, or is not a plain registry
 * range a project outside the workspace can install (`workspace:`, named
 * `catalog:` entries, `file:` and similar protocols).
 */
export function resolveTemplateVersions(repoRoot: string = findWorkspaceRoot()): TemplateDependencyVersions {
  const catalog = parseCatalog(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
  const versions = {} as Record<TemplateDependency, string>;
  const entries = Object.entries(TEMPLATE_DEPENDENCY_SOURCES) as Array<
    [TemplateDependency, TemplateDependencySource]
  >;
  for (const [name, source] of entries) {
    const range = resolveOne(name, source, catalog, repoRoot).trim();
    if (!range || /^[a-z][a-z0-9+.-]*:/i.test(range)) {
      throw new Error(`${name}: "${range}" is not a registry range a generated project can install`);
    }
    versions[name] = range;
  }
  return versions;
}

/** `define` entries for tsup and vitest. */
export function templateVersionDefines(repoRoot?: string): Record<string, string> {
  return { [TEMPLATE_VERSIONS_DEFINE]: JSON.stringify(resolveTemplateVersions(repoRoot)) };
}
