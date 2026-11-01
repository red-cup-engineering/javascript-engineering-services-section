import { schemaFromGraph } from "@red-cup-engineering/json-schema-services-section/contracts";

/** Judge each assay value in its own explicit schema universe. Neither another
 * operation nor an earlier plan can supply a missing resource or change its
 * root, including the scope of local references and embedded identifiers.
 */
export function closedAssaySchema(schema) {
  const id = typeof schema === "object" && schema !== null && schema.$id !== undefined
    ? schema.$id : "urn:561:jsnode-plan:inline-schema";
  const root = typeof schema === "boolean" ? { $id: id, allOf: [schema] } : { ...schema, $id: id };
  return schemaFromGraph({ root: id, schemas: [{ id, schema: root }] });
}
