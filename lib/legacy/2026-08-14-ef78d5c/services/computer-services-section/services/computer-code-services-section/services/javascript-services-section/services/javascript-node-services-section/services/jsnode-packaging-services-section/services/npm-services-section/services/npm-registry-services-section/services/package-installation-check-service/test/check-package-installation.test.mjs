import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { checkPackageInstallations, inspectInstalledPackage, selectRegistryPackages } from "../src/check-package-installation.mjs";

const execute = promisify(execFile);

test("accepts complete installed faces and internal relative imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "installed-package-inspection-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "@customer/example", version: "1.0.0", exports: "./src/index.mjs", bin: { example: "src/cli.mjs" } })}\n`);
    await writeFile(join(root, "src/index.mjs"), "import './side-effect.mjs';\nexport { value } from './value.mjs';\n");
    await writeFile(join(root, "src/side-effect.mjs"), "export {};\n");
    await writeFile(join(root, "src/value.mjs"), "export const value = 1;\n");
    await writeFile(join(root, "src/cli.mjs"), "#!/usr/bin/env node\nconsole.log('ok');\n");
    await chmod(join(root, "src/cli.mjs"), 0o755);
    const result = await inspectInstalledPackage({ packageRoot: root, expectedName: "@customer/example", expectedVersion: "1.0.0" });
    assert.deepEqual(result.defects, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("refuses missing faces and imports escaping the carrier", async () => {
  const root = await mkdtemp(join(tmpdir(), "installed-package-refusal-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "@customer/broken", version: "1.0.0", exports: { ".": "./src/index.mjs", "./missing": "./src/missing.mjs" } })}\n`);
    await writeFile(join(root, "src/index.mjs"), "import './missing-side-effect.mjs';\nimport 'absent-dependency';\nexport { value } from '../../sibling.mjs';\n");
    const result = await inspectInstalledPackage({ packageRoot: root, expectedName: "@customer/broken", expectedVersion: "1.0.0" });
    assert.deepEqual(result.defects.map(({ law }) => law).sort(), ["declared-import-runtime", "installed-face-target", "relative-import-membrane", "relative-import-target", "runtime-dependency-declaration"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("refuses installed manifests with local dependency protocols without inventing a --help contract for bins", async () => {
  const root = await mkdtemp(join(tmpdir(), "installed-package-protocol-refusal-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "@customer/local", version: "1.0.0", exports: "./src/index.mjs", bin: { local: "./src/cli.mjs" }, dependencies: { sibling: "workspace:*" }, optionalDependencies: { localFile: "file:../local-file" }, peerDependencies: { linked: "link:../linked" } })}\n`);
    await writeFile(join(root, "src/index.mjs"), "export const value = 1;\n");
    await writeFile(join(root, "src/cli.mjs"), "#!/usr/bin/env node\nprocess.exitCode = 1;\n");
    await chmod(join(root, "src/cli.mjs"), 0o755);
    const result = await inspectInstalledPackage({ packageRoot: root, expectedName: "@customer/local", expectedVersion: "1.0.0" });
    assert.deepEqual(result.defects.map(({ law }) => law).sort(), ["installed-local-dependency-protocol", "installed-local-dependency-protocol", "installed-local-dependency-protocol"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reads runtime imports as JavaScript syntax rather than matching source-text lookalikes", async () => {
  const root = await mkdtemp(join(tmpdir(), "installed-package-import-reading-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "@customer/strings", version: "1.0.0", exports: "./index.mjs" })}\n`);
    await writeFile(join(root, "index.mjs"), `const example = 'import("not-a-dependency")';\nexport { example };\n`);
    const result = await inspectInstalledPackage({ packageRoot: root, expectedName: "@customer/strings", expectedVersion: "1.0.0" });
    assert.deepEqual(result.defects, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("installs an exact release against the receipt registry in an isolated scripts-disabled project", async () => {
  const root = await mkdtemp(join(tmpdir(), "package-installation-assay-fixture-"));
  try {
    const receiptPath = join(root, "receipt.json");
    const npmConfigPath = join(root, ".npmrc");
    const capturePath = join(root, "npm-arguments.txt");
    const fakeNpm = join(root, "fake-npm");
    await writeFile(receiptPath, `${JSON.stringify({ registry: "http://registry.example.invalid/", packages: [{ name: "@customer/example", version: "1.2.3" }] })}\n`);
    await writeFile(npmConfigPath, "fund=false\n");
    await writeFile(fakeNpm, `#!/bin/sh
prefix=""
previous=""
for value in "$@"; do
  if [ "$previous" = "--prefix" ]; then prefix="$value"; fi
  previous="$value"
done
printf '%s\\n' "$@" >> "$ASSAY_CAPTURE"
if [ "$1" = "install" ]; then
  mkdir -p "$prefix/node_modules/@customer/example/src"
  mkdir -p "$prefix/node_modules/.bin"
  printf '%s\\n' '{"name":"@customer/example","version":"1.2.3","exports":"./src/index.mjs","bin":{"example":"./src/cli"}}' > "$prefix/node_modules/@customer/example/package.json"
  printf '%s\\n' 'export const installed = true;' > "$prefix/node_modules/@customer/example/src/index.mjs"
  printf '%s\\n' '#!/bin/sh' 'test "$1" = "--help"' > "$prefix/node_modules/@customer/example/src/cli"
  chmod 755 "$prefix/node_modules/@customer/example/src/cli"
  ln -s ../@customer/example/src/cli "$prefix/node_modules/.bin/example"
else
  printf '%s\\n' '{"dependencies":{"@customer/example":{"version":"1.2.3"}}}'
fi
`);
    await chmod(fakeNpm, 0o755);
    const previousCapture = process.env.ASSAY_CAPTURE;
    process.env.ASSAY_CAPTURE = capturePath;
    try {
      const result = await checkPackageInstallations({ registryReceiptPath: receiptPath, npmConfigPath, npmCommand: fakeNpm, temporaryParent: root, concurrency: 1 });
      assert.equal(result.conformant, true);
      assert.equal(result.records[0].name, "@customer/example");
    } finally {
      if (previousCapture === undefined) delete process.env.ASSAY_CAPTURE;
      else process.env.ASSAY_CAPTURE = previousCapture;
    }
    const argumentsUsed = await readFile(capturePath, "utf8");
    assert.match(argumentsUsed, /--registry\nhttp:\/\/registry\.example\.invalid\//u);
    assert.match(argumentsUsed, /--ignore-scripts/u);
    assert.match(argumentsUsed, /--workspaces=false/u);
    assert.match(argumentsUsed, /@customer\/example@1\.2\.3/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("writes a valid isolated manifest and fetches a packed release from a loopback registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "package-installation-loopback-assay-"));
  const server = createServer();
  try {
    const packageRoot = join(root, "package");
    const artifacts = join(root, "artifacts");
    const receiptPath = join(root, "receipt.json");
    const npmConfigPath = join(root, ".npmrc");
    const manifestCapturePath = join(root, "temporary-package.json");
    const npmWrapper = join(root, "npm-wrapper");
    await mkdir(packageRoot);
    await mkdir(artifacts);
    await writeFile(join(packageRoot, "package.json"), `${JSON.stringify({ name: "@customer/loopback-example", version: "1.2.3", type: "module", exports: "./index.mjs", files: ["index.mjs"] })}\n`);
    await writeFile(join(packageRoot, "index.mjs"), "export const installed = true;\n");
    const packed = JSON.parse((await execute("npm", ["pack", "--json", "--pack-destination", artifacts, "--ignore-scripts"], { cwd: packageRoot })).stdout);
    const tarball = await readFile(join(artifacts, packed[0].filename));
    const requests = [];
    server.on("request", (request, response) => {
      const path = decodeURIComponent(new URL(request.url, "http://registry.invalid").pathname);
      requests.push(path);
      if (path === "/@customer/loopback-example") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ name: "@customer/loopback-example", versions: { "1.2.3": { name: "@customer/loopback-example", version: "1.2.3", type: "module", exports: "./index.mjs", dist: { tarball: `${registryUrl}@customer/loopback-example/-/loopback-example-1.2.3.tgz` } } }, "dist-tags": { latest: "1.2.3" } }));
        return;
      }
      if (path === "/@customer/loopback-example/-/loopback-example-1.2.3.tgz") {
        response.setHeader("content-type", "application/octet-stream");
        response.end(tarball);
        return;
      }
      response.statusCode = 404;
      response.end("not found");
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const { port } = server.address();
    const registryUrl = `http://127.0.0.1:${port}/`;
    await writeFile(receiptPath, `${JSON.stringify({ registry: registryUrl, packages: [{ name: "@customer/loopback-example", version: "1.2.3" }] })}\n`);
    await writeFile(npmConfigPath, "fund=false\n");
    await writeFile(npmWrapper, "#!/bin/sh\nprefix=\nprevious=\nfor value in \"$@\"; do\n  if [ \"$previous\" = \"--prefix\" ]; then prefix=$value; fi\n  previous=$value\ndone\nif [ \"$1\" = \"install\" ]; then cp \"$prefix/package.json\" \"$ASSAY_MANIFEST_CAPTURE\"; fi\nexec npm \"$@\"\n");
    await chmod(npmWrapper, 0o755);
    const previousCapture = process.env.ASSAY_MANIFEST_CAPTURE;
    process.env.ASSAY_MANIFEST_CAPTURE = manifestCapturePath;
    try {
      const result = await checkPackageInstallations({ registryReceiptPath: receiptPath, npmConfigPath, npmCommand: npmWrapper, temporaryParent: root, concurrency: 1 });
      assert.equal(result.conformant, true);
    } finally {
      if (previousCapture === undefined) delete process.env.ASSAY_MANIFEST_CAPTURE;
      else process.env.ASSAY_MANIFEST_CAPTURE = previousCapture;
    }
    assert.deepEqual(JSON.parse(await readFile(manifestCapturePath, "utf8")), { private: true });
    assert.ok(requests.includes("/@customer/loopback-example"));
    assert.ok(requests.includes("/@customer/loopback-example/-/loopback-example-1.2.3.tgz"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("selects exact releases and refuses an ambiguous package name", () => {
  const packages = [
    { name: "@customer/example", version: "1.0.0" },
    { name: "@customer/example", version: "2.0.0" },
    { name: "@customer/other", version: "1.0.0" },
  ];
  assert.deepEqual(selectRegistryPackages(packages, ["@customer/example@2.0.0", "@customer/other"]), [packages[1], packages[2]]);
  assert.throws(() => selectRegistryPackages(packages, ["@customer/example"]), /version-ambiguous/u);
  assert.throws(() => selectRegistryPackages(packages, ["@customer/absent@1.0.0"]), /absent/u);
});
