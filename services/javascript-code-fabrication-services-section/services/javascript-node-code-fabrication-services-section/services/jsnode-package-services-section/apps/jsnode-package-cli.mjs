import { admitJsnodeOperationPackageSpecification as operation0 } from "../src/admit-jsnode-operation-package-specification.mjs";
import { projectJsnodeOperationPackage as operation1 } from "../src/project-jsnode-operation-package.mjs";
import { createJsnodeOperationPackage as operation2 } from "../src/create-jsnode-operation-package.mjs";
import { projectJsnodeModules as operation3 } from "../src/project-jsnode-modules.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification as operation4 } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";
import operation0InputSchema from "../data/records/schema/admit-jsnode-operation-package-specification.input.schema.json" with { type: "json" };
import operation0OutputSchema from "../data/records/schema/admit-jsnode-operation-package-specification.output.schema.json" with { type: "json" };
import operation1InputSchema from "../data/records/schema/project-jsnode-operation-package.input.schema.json" with { type: "json" };
import operation1OutputSchema from "../data/records/schema/project-jsnode-operation-package.output.schema.json" with { type: "json" };
import operation2InputSchema from "../data/records/schema/create-jsnode-operation-package.input.schema.json" with { type: "json" };
import operation2OutputSchema from "../data/records/schema/create-jsnode-operation-package.output.schema.json" with { type: "json" };
import operation3InputSchema from "../data/records/schema/jsnode-module-specification.schema.json" with { type: "json" };
import operation4InputSchema from "../data/records/schema/translate-markdown-jsnode-operation-package-specification.input.schema.json" with { type: "json" };
import operation4OutputSchema from "../data/records/schema/translate-markdown-jsnode-operation-package-specification.output.schema.json" with { type: "json" };

export const catalog = Object.freeze({
  name: "jsnode-package",
  description: "Fabricate a package from its specification.",
  operations: {
    "admit": { name: "admit", description: "Admit a package specification.", operation: operation0, inputSchema: operation0InputSchema, outputSchema: operation0OutputSchema },
    "project": { name: "project", description: "Project package files.", operation: operation1, inputSchema: operation1InputSchema, outputSchema: operation1OutputSchema },
    "create": { name: "create", description: "Create the specified package.", operation: operation2, inputSchema: operation2InputSchema, outputSchema: operation2OutputSchema },
    "project-modules": { name: "project-modules", description: "Project shared JSNode modules and an optional catalog CLI.", operation: operation3, inputSchema: operation3InputSchema },
    "translate-markdown": { name: "translate-markdown", description: "Translate a Markdown work order into a package specification.", operation: operation4, inputSchema: operation4InputSchema, outputSchema: operation4OutputSchema },
  },
});
