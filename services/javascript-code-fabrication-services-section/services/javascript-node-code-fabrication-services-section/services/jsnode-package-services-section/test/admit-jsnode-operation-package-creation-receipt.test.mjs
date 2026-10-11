import assert from "node:assert/strict";
import test from "node:test";
import { admitJsnodeOperationPackageCreationReceipt } from "../src/admit-jsnode-operation-package-creation-receipt.mjs";

const digest = `sha256:${"a".repeat(64)}`;

function candidate() {
  return {
    type: "JsnodeOperationPackageCreationReceipt",
    version: 1,
    packageName: "@red-cup-engineering/example-service",
    packageVersion: "0.1.0",
    destination: "/tmp/example-service",
    filesDigest: digest,
    files: [{ type: "TextFileMaterialization", version: 1, path: "scripts/example.mjs", mode: 0o755, digest }],
    assays: [
      { type: "JsnodeOperationPackageAssay", version: 1, name: "syntax", status: "passed" },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "tests", status: "passed", paths: ["test/example.test.mjs"] },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "pack", status: "passed", filename: "example.tgz", digest },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "clean-installation", status: "passed", javascriptFiles: 1, reachableJavascriptFiles: 1 },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "import-face", status: "passed", examples: 1 },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "command-face", status: "passed", examples: 1 },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "help", status: "passed" },
    ],
  };
}

test("admits and freezes complete creation evidence", () => {
  const admitted = admitJsnodeOperationPackageCreationReceipt(candidate());
  assert.equal(admitted.type, "JsnodeOperationPackageCreationReceipt");
  assert(Object.isFrozen(admitted));
  assert(Object.isFrozen(admitted.files));
  assert(Object.isFrozen(admitted.assays));
});

test("refuses a malformed digest", () => {
  const input = candidate();
  input.filesDigest = "sha256:no";
  assert.equal(admitJsnodeOperationPackageCreationReceipt(input).code, "INVALID_DIGEST");
});

test("admits module-only evidence without retired direct-script assays", () => {
  const input = candidate();
  input.assays = input.assays.filter((entry) => !["command-face", "help"].includes(entry.name));
  assert.equal(admitJsnodeOperationPackageCreationReceipt(input).type, "JsnodeOperationPackageCreationReceipt");
});

test("refuses incomplete or reordered assay evidence", () => {
  const input = candidate();
  input.assays = input.assays.filter((entry) => entry.name !== "tests");
  assert.equal(admitJsnodeOperationPackageCreationReceipt(input).code, "INCOMPLETE_ASSAYS");
  input.assays = [];
  assert.equal(admitJsnodeOperationPackageCreationReceipt(input).code, "INCOMPLETE_ASSAYS");
});
