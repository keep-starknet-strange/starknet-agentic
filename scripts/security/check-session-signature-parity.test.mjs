import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  asArrayIfPresent,
  compareVectorGroup,
  main,
  parseArgs,
  stableStringify,
  toMapById,
} from "./check-session-signature-parity.mjs";

function withSilentConsole(run) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function writeJson(dir, fileName, payload) {
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
  return filePath;
}

test("stableStringify canonicalizes object key order", () => {
  const a = { z: 1, a: { y: 2, x: 3 } };
  const b = { a: { x: 3, y: 2 }, z: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test("parseArgs reads named flags", () => {
  const parsed = parseArgs([
    "--counterpart",
    "SISNA",
    "--local-schema",
    "a.json",
    "--remote-schema",
    "b.json",
    "--local-vectors",
    "c.json",
    "--remote-vectors",
    "d.json",
  ]);
  assert.equal(parsed.counterpart, "SISNA");
  assert.equal(parsed.localSchemaPath, "a.json");
  assert.equal(parsed.remoteSchemaPath, "b.json");
  assert.equal(parsed.localVectorsPath, "c.json");
  assert.equal(parsed.remoteVectorsPath, "d.json");
  assert.equal(parsed.label, "Spec parity");
  assert.equal(parsed.vectorKey, "vectors");
});

test("parseArgs supports optional label and vector key", () => {
  const parsed = parseArgs([
    "--counterpart",
    "SISNA",
    "--local-schema",
    "a.json",
    "--remote-schema",
    "b.json",
    "--local-vectors",
    "c.json",
    "--remote-vectors",
    "d.json",
    "--label",
    "Session signature parity",
    "--vector-key",
    "vectors",
    "--secondary-key",
    "sessionVectors",
  ]);
  assert.equal(parsed.label, "Session signature parity");
  assert.equal(parsed.vectorKey, "vectors");
  assert.equal(parsed.secondaryKey, "sessionVectors");
});

test("parseArgs rejects unexpected positionals", () => {
  assert.throws(
    () => parseArgs(["oops", "--counterpart", "SISNA"]),
    /Unexpected argument: oops/,
  );
});

test("parseArgs rejects missing values", () => {
  assert.throws(
    () => parseArgs(["--counterpart"]),
    /Missing value for --counterpart/,
  );
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(
    () => parseArgs(["--counterpart", "SISNA", "--bad-flag", "1"]),
    /Unknown flag: --bad-flag/,
  );
});

test("compareVectorGroup reports missing, extra, and changed IDs", () => {
  const local = [
    { id: "same", value: "ok" },
    { id: "missing_remote", value: "x" },
    { id: "changed", value: "left" },
  ];
  const remote = [
    { id: "same", value: "ok" },
    { id: "extra_remote", value: "y" },
    { id: "changed", value: "right" },
  ];

  const result = compareVectorGroup("vectors", local, remote);
  assert.equal(result.hasIssues, true);
  assert.deepEqual(result.missingInRemote, ["missing_remote"]);
  assert.deepEqual(result.missingInLocal, ["extra_remote"]);
  assert.deepEqual(result.changed, ["changed"]);
});

test("compareVectorGroup flags changed payload even when IDs match", () => {
  const local = [{ id: "only", nested: { a: 1, b: 2 } }];
  const remote = [{ id: "only", nested: { a: 1, b: 3 } }];

  const result = compareVectorGroup("sessionVectors", local, remote);
  assert.equal(result.hasIssues, true);
  assert.deepEqual(result.missingInRemote, []);
  assert.deepEqual(result.missingInLocal, []);
  assert.deepEqual(result.changed, ["only"]);
});

test("compareVectorGroup passes when arrays are parity-equal", () => {
  const local = [
    { id: "one", value: { x: 1, y: 2 } },
    { id: "two", value: [3, 4] },
  ];
  const remote = [
    { id: "two", value: [3, 4] },
    { id: "one", value: { y: 2, x: 1 } },
  ];

  const result = compareVectorGroup("vectors", local, remote);
  assert.equal(result.hasIssues, false);
  assert.deepEqual(result.missingInRemote, []);
  assert.deepEqual(result.missingInLocal, []);
  assert.deepEqual(result.changed, []);
});

test("toMapById rejects vectors missing ids", () => {
  assert.throws(
    () => toMapById([{ id: "ok" }, { notId: "bad" }]),
    /Vector without string id/
  );
});

test("toMapById rejects duplicate ids", () => {
  assert.throws(
    () => toMapById([{ id: "dup", value: 1 }, { id: "dup", value: 2 }]),
    /Duplicate vector id found while comparing parity: dup/,
  );
});

test("asArrayIfPresent returns arrays and null otherwise", () => {
  assert.deepEqual(asArrayIfPresent([1, 2]), [1, 2]);
  assert.equal(asArrayIfPresent({}), null);
  assert.equal(asArrayIfPresent(null), null);
});

test("main returns 0 when schema and vectors are parity-equal", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-parity-ok-"));
  try {
    const schema = { type: "object", properties: { id: { type: "string" } } };
    const vectors = {
      vectors: [{ id: "outside-1", value: 1 }],
      sessionVectors: [{ id: "session-1", value: "ok" }],
    };
    const exitCode = withSilentConsole(() =>
      main([
        "--counterpart",
        "SISNA",
        "--local-schema",
        writeJson(fixtureDir, "local-schema.json", schema),
        "--remote-schema",
        writeJson(fixtureDir, "remote-schema.json", schema),
        "--local-vectors",
        writeJson(fixtureDir, "local-vectors.json", vectors),
        "--remote-vectors",
        writeJson(fixtureDir, "remote-vectors.json", vectors),
        "--secondary-key",
        "sessionVectors",
      ]),
    );
    assert.equal(exitCode, 0);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("main returns 1 when vectors drift", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-parity-drift-"));
  try {
    const schema = { type: "object", properties: { id: { type: "string" } } };
    const localVectors = {
      vectors: [{ id: "outside-1", value: 1 }],
      sessionVectors: [{ id: "session-1", value: "ok" }],
    };
    const remoteVectors = {
      vectors: [{ id: "outside-1", value: 2 }],
      sessionVectors: [{ id: "session-1", value: "ok" }],
    };

    const exitCode = withSilentConsole(() =>
      main([
        "--counterpart",
        "SISNA",
        "--local-schema",
        writeJson(fixtureDir, "local-schema.json", schema),
        "--remote-schema",
        writeJson(fixtureDir, "remote-schema.json", schema),
        "--local-vectors",
        writeJson(fixtureDir, "local-vectors.json", localVectors),
        "--remote-vectors",
        writeJson(fixtureDir, "remote-vectors.json", remoteVectors),
        "--secondary-key",
        "sessionVectors",
      ]),
    );
    assert.equal(exitCode, 1);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("main returns 2 on usage errors", () => {
  const exitCode = withSilentConsole(() => main([]));
  assert.equal(exitCode, 2);
});

test("main returns 3 on unexpected runtime errors", () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-parity-runtime-"));
  try {
    const schema = { type: "object" };
    const vectors = { vectors: [{ id: "outside-1", value: 1 }] };

    const exitCode = withSilentConsole(() =>
      main([
        "--counterpart",
        "SISNA",
        "--local-schema",
        path.join(fixtureDir, "missing-local-schema.json"),
        "--remote-schema",
        writeJson(fixtureDir, "remote-schema.json", schema),
        "--local-vectors",
        writeJson(fixtureDir, "local-vectors.json", vectors),
        "--remote-vectors",
        writeJson(fixtureDir, "remote-vectors.json", vectors),
      ]),
    );
    assert.equal(exitCode, 3);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
