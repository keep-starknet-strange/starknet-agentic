import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SERVER_VERSION } from "../../src/version.js";

describe("SERVER_VERSION", () => {
  it("matches this package's package.json version", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(SERVER_VERSION).toBe(manifest.version);
  });
});
