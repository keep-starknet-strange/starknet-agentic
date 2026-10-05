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

// One npm semver comparator: an optional operator, then a version whose minor,
// patch and prerelease/build parts are optional (`^10.8.0`, `~4.2`, `>=1.2.3-rc.1`,
// `4.x`, `1.2.x`). Wildcards are allowed only after an explicit major, and once a
// part is a wildcard every later part must be one too: npm reads `1.x.3` as `1.x`,
// a looser pin than the text suggests.
const COMPARATOR =
  /^(?:\^|~|>=|<=|>|<|=)?v?\d+(?:\.(?:\d+(?:\.(?:\d+|[xX*]))?|[xX*](?:\.[xX*])?))?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * True for an npm semver range with a concrete lower bound: comparator sets
 * joined by `||`, each a space-separated list of comparators or a hyphen range
 * (`1.2.3 - 2.3.4`). Rejects dist-tags (`latest`, `next`), unbounded `*` / `x`,
 * protocols and anything else a generated package.json should not pin.
 */
export function isRegistryRange(range: string): boolean {
  return range.split("||").every((set) => {
    const parts = set.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    if (parts.length === 3 && parts[1] === "-") {
      return COMPARATOR.test(parts[0]) && COMPARATOR.test(parts[2]) && !/^[\^~<>=]/.test(parts[0] + parts[2]);
    }
    return parts.every((part) => COMPARATOR.test(part));
  });
}

/**
 * Resolves every dependency in TEMPLATE_DEPENDENCY_SOURCES to the range this
 * workspace declares. Throws when one is missing, or is not a semver range a
 * project outside the workspace can install from the registry (`workspace:`,
 * named `catalog:` entries, `file:` and other protocols, dist-tags such as
 * `latest`, unbounded `*`).
 */
export function resolveTemplateVersions(repoRoot: string = findWorkspaceRoot()): TemplateDependencyVersions {
  const catalog = parseCatalog(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"));
  const versions = {} as Record<TemplateDependency, string>;
  const entries = Object.entries(TEMPLATE_DEPENDENCY_SOURCES) as Array<
    [TemplateDependency, TemplateDependencySource]
  >;
  for (const [name, source] of entries) {
    const range = resolveOne(name, source, catalog, repoRoot).trim();
    if (!isRegistryRange(range)) {
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
