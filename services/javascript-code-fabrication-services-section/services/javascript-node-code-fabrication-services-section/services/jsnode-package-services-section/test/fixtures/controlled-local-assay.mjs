// TEST FIXTURE ONLY. This is deliberately NOT an isolated production worker.
// It tests the behavior of the existing source-free synthesis pipeline with
// *controlled literal test source* while production requires a host-composed
// sandbox. Never import from src/ or bundle into a serving application.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function controlledLocalAssayFixture(request) {
  if (request?.kind !== "jsnode.connected-module-pre-assay" ||
      request.network !== false || request.writableHostWorkspace !== false)
    throw new TypeError("a complete bounded isolated assay request is required");
  const workspace = mkdtempSync(path.join(tmpdir(), "jsnode-controlled-assay-"));
  try {
    for (const dependency of request.dependencies) {
      const nodeLink = path.join(workspace, "node_modules", dependency.expectedName);
      mkdirSync(path.dirname(nodeLink), { recursive: true });
      symlinkSync(dependency.packageRoot, nodeLink, "dir");
    }
    for (const file of request.files) {
      const target = path.join(workspace, file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file.text, { flag: "wx" });
    }
    const result = spawnSync(process.execPath,
      ["--test", "--test-reporter=tap", ...request.testPaths],
      { cwd: workspace, env: { TZ: "UTC" }, encoding: "utf8",
        timeout: request.timeoutMs, maxBuffer: 2 * 1024 * 1024 });
    // Simulated host receipt in a literal-source test only. Real untrusted
    // production execution must come from Guix/LAGOON runtime isolation.
    return { isolated: true, status: result.status, signal: result.signal,
      stdout: result.stdout ?? "", stderr: result.stderr ?? "",
      truncated: result.error?.code === "ENOBUFS",
      timedOut: result.error?.code === "ETIMEDOUT" };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
