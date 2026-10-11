import { readFile } from "node:fs/promises";
import { translateMarkdownJsnodeOperationPackageSpecification } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";

// A declaration: the code layer's run-javascript-node-operation-module executes it.
export const command = Object.freeze({
  async run({ argv }) {
    const [sourcePath] = argv;
    if (!sourcePath || argv.length !== 1) throw new Error("usage: translate-markdown-jsnode-operation-package-specification <work-order.md>");
    const bytes = await readFile(sourcePath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return translateMarkdownJsnodeOperationPackageSpecification({ type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1, source: { type: "MarkdownDocumentSource", path: sourcePath, text } });
  },
  formatResult: (result) => `${JSON.stringify(result)}\n`,
});
