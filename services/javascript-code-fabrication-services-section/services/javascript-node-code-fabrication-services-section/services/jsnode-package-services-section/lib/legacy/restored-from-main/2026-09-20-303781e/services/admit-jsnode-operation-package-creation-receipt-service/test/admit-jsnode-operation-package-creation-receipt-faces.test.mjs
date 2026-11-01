import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { admitJsnodeOperationPackageCreationReceipt } from "../scripts/admit-jsnode-operation-package-creation-receipt.mjs";

const examples = [
  {
    "type": "JavascriptNodeOperationExample",
    "name": "admits complete creation evidence",
    "input": {
      "type": "JsnodeOperationPackageCreationReceipt",
      "version": 1,
      "packageName": "@red-cup-engineering/example-service",
      "packageVersion": "0.1.0",
      "destination": "/tmp/example-service",
      "filesDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "files": [
        {
          "type": "TextFileMaterialization",
          "version": 1,
          "path": "scripts/example.mjs",
          "mode": 493,
          "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ],
      "assays": [
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "syntax",
          "status": "passed"
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "the-rule",
          "status": "passed",
          "scripts": 1,
          "lines": 20
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "tests",
          "status": "passed",
          "paths": [
            "test/example.test.mjs"
          ]
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "pack",
          "status": "passed",
          "filename": "example.tgz",
          "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "clean-installation",
          "status": "passed",
          "javascriptFiles": 1,
          "reachableJavascriptFiles": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "import-face",
          "status": "passed",
          "examples": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "command-face",
          "status": "passed",
          "examples": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "help",
          "status": "passed"
        }
      ]
    },
    "output": {
      "type": "JsnodeOperationPackageCreationReceipt",
      "version": 1,
      "packageName": "@red-cup-engineering/example-service",
      "packageVersion": "0.1.0",
      "destination": "/tmp/example-service",
      "filesDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "files": [
        {
          "type": "TextFileMaterialization",
          "version": 1,
          "path": "scripts/example.mjs",
          "mode": 493,
          "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ],
      "assays": [
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "syntax",
          "status": "passed"
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "the-rule",
          "status": "passed",
          "scripts": 1,
          "lines": 20
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "tests",
          "status": "passed",
          "paths": [
            "test/example.test.mjs"
          ]
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "pack",
          "status": "passed",
          "filename": "example.tgz",
          "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "clean-installation",
          "status": "passed",
          "javascriptFiles": 1,
          "reachableJavascriptFiles": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "import-face",
          "status": "passed",
          "examples": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "command-face",
          "status": "passed",
          "examples": 1
        },
        {
          "type": "JsnodeOperationPackageAssay",
          "version": 1,
          "name": "help",
          "status": "passed"
        }
      ]
    }
  }
];

for (const example of examples) {
  test(example.name, async () => {
    const importedOutput = await admitJsnodeOperationPackageCreationReceipt(example.input);
    assert.deepEqual(importedOutput, example.output);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/admit-jsnode-operation-package-creation-receipt.mjs", import.meta.url))], {
      input: JSON.stringify(example.input) + "\n",
      encoding: "utf8",
    });
    assert.equal(command.status, 0, command.stderr);
    const commandOutput = JSON.parse(command.stdout.trim());
    assert.deepEqual(commandOutput, example.output);
    assert.deepEqual(commandOutput, importedOutput);
  });
}
