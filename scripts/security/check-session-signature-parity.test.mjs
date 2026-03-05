import assert from "node:assert/strict";
import test from "node:test";
import {
  asArrayIfPresent,
  compareVectorGroup,
  parseArgs,
  stableStringify,
  toMapById,
} from "./check-session-signature-parity.mjs";

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
  ]);
  assert.equal(parsed.label, "Session signature parity");
  assert.equal(parsed.vectorKey, "vectors");
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
