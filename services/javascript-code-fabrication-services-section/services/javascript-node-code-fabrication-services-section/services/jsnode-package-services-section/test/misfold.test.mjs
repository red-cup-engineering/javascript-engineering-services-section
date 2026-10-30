import test from "node:test";
import assert from "node:assert/strict";
import { misfoldRefusal, misfoldsOfModule } from "../src/misfold.mjs";

// The folding-protein note (Lenticule Science, 2026-07-24, section 5): "A misfold is a wrapper,
// certificate, or subsystem deposited beside the territory instead of folded from the proof."

const kinds = (text, names = ["slugify"]) => misfoldsOfModule(text, "src/slug.mjs", names).map(item => item.kind);

test("re-exporting a dependency's capability under the operation's name is a misfold", () => {
  assert.deepEqual(kinds('export { toSlug as slugify } from "@scope/strings";'), ["re-export"]);
  assert.deepEqual(kinds('export * from "@scope/strings";'), ["re-export"]);
});

test("aliasing or forwarding to a dependency import is a misfold", () => {
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport const slugify = toSlug;'), ["alias"]);
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport { toSlug as slugify };'), ["alias"]);
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport function slugify(text) { return toSlug(text); }'), ["delegation"]);
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport async function slugify(text) { return await toSlug(text); }'), ["delegation"]);
  assert.deepEqual(kinds('import toSlug from "@scope/strings";\nexport const slugify = (text) => toSlug(text);'), ["delegation"]);
});

test("a module that folds the capability from the order is not a misfold", () => {
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport function slugify(text) { return toSlug(text.trim()).slice(0, 64); }'), []);
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport function slugify(text, max) { return toSlug(max, text); }'), [], "reordered arguments adapt the capability");
  assert.deepEqual(kinds('export function slugify(text) { return text.toLowerCase().replaceAll(" ", "-"); }'), []);
  assert.deepEqual(kinds('import { toSlug } from "./strings.mjs";\nexport const slugify = toSlug;'), [], "the package's own module is its territory");
  assert.deepEqual(kinds('import { toSlug } from "@scope/strings";\nexport const helper = toSlug;\nexport function slugify(t) { return t; }'), [], "only operation exports are read");
});

test("a misfold is refused with the reason, and a folded module is not", () => {
  assert.match(misfoldRefusal(misfoldsOfModule('export { toSlug as slugify } from "@scope/strings";', "src/slug.mjs", ["slugify"])), /slugify is a re-export of @scope\/strings/u);
  assert.equal(misfoldRefusal([]), undefined);
});
