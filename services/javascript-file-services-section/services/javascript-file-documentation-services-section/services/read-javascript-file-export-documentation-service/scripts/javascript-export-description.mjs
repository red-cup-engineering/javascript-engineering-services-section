import { admitDescription } from "@red-cup-engineering/computer-content-engineering-services-section/description";

/** Admits prose that identifies one JavaScript export to documentation readers. */
export function admitJavascriptExportDescription(value) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError("JavaScript export description must be nonempty text");
  const text = value.replace(/\s+/gu, " ").trim();
  return admitDescription({
    type: "Description",
    version: 1,
    subject: { kind: "javascript-export" },
    consumer: { kind: "javascript-api-reader", decision: "distinguish the export's operation before reading its signature and detailed tags" },
    text,
    predicates: [{ claim: text, grounds: ["export-jsdoc"], separatesFrom: ["undocumented JavaScript exports"] }],
    neighbors: [{ kind: "javascript-export", contrast: "undocumented JavaScript exports" }],
  });
}
