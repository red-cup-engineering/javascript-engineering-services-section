import { createHandler, materializeMovement } from "../main.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition { if (!condition) throw new Error(message); }
const input = { sourceText: "export function moveMe() { return 1; }\nexport const source = true;\n", targetText: "export const target = true;\n", functionName: "moveMe", functionSource: "export function moveMe() { return 1; }", targetMarker: "export const target = true;" };

Deno.test("materializes movement without persistence", async () => {
  const result = await materializeMovement(input);
  assert(result.providerWorkspace === "ephemeral"); assert(result.persisted === false); assert(String(result.sourceText).includes("export const source")); assert(String(result.targetText).includes("function moveMe"));
});

Deno.test("handler refuses unsigned movement", async () => {
  const handler = createHandler({ verifySignature: async () => false });
  const body = JSON.stringify(input);
  const result = await handler(new Request("https://cloud.invalid/v1/prepare-function-movement", { method: "POST", headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(body).byteLength) }, body }));
  assert(result.status === 401);
});
