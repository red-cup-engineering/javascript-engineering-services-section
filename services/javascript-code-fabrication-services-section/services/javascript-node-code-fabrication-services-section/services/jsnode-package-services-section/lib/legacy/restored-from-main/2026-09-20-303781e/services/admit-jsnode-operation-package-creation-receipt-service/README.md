# @red-cup-engineering/admit-jsnode-operation-package-creation-receipt-service

Admits the complete immutable evidence that one JSNode operation package was created successfully.

## Operation

~~~js
export function admitJsnodeOperationPackageCreationReceipt(candidate)
~~~

### Parameters

- candidate (object): A JsnodeOperationPackageCreationReceipt candidate.

### Returns

object: The admitted immutable receipt or a specific receipt-refusal record.

## Command

admit-jsnode-operation-package-creation-receipt reads one JSON value per input line and writes one JSON value per output line.

## Examples

### admits complete creation evidence

Input:

~~~json
{
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
~~~

Output:

~~~json
{
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
~~~
