import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../apps/fabrication-mcp.mjs", import.meta.url));

function receiveMcp(root, messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [appPath], { env: { ...process.env, INFO_REPOSITORY_ROOT: root }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`fabrication MCP exited ${code}: ${stderr}`));
      else resolve(stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line)));
    });
    child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  });
}

test("serves initialize, its native JSON Schema catalog, and invalid arguments over fresh stdio", async () => {
  const root = await mkdtemp(path.join("/tmp", "fabrication-mcp-"));
  try {
    const responses = await receiveMcp(root, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "translate_work_order", arguments: {} } },
    ]);
    assert.equal(responses.length, 3);
    assert.equal(responses[0].id, 1);
    assert.equal(responses[0].result.serverInfo.name, "jsnode-fabrication");
    assert.equal(responses[1].id, 2);
    assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ["translate_work_order", "fabricate_jsnode_operation_package", "list_fabrication_records"]);
    const fabricate = responses[1].result.tools.find((tool) => tool.name === "fabricate_jsnode_operation_package");
    assert.equal(fabricate.inputSchema.properties.registry.default, "https://registry.561.group");
    assert.equal(fabricate.inputSchema.properties.publish.default, false);
    const records = responses[1].result.tools.find((tool) => tool.name === "list_fabrication_records");
    assert.equal(records.inputSchema.properties.limit.minimum, 1);
    assert.equal(records.inputSchema.properties.limit.maximum, 1000);
    assert.equal(responses[2].id, 3);
    assert.equal(responses[2].error.code, -32602);
    assert.match(responses[2].error.message, /arguments outside inputSchema/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
