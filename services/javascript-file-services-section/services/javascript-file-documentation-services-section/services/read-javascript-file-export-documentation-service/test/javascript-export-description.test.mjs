import assert from "node:assert/strict";
import test from "node:test";
import { admitJavascriptExportDescription } from "../scripts/javascript-export-description.mjs";

test("admits and normalizes a JavaScript export description", () => {
  assert.equal(admitJavascriptExportDescription("Reads one export\n  description.").text, "Reads one export description.");
});

test("rejects an absent JavaScript export description", () => {
  assert.throws(() => admitJavascriptExportDescription("  "), /nonempty/u);
});
