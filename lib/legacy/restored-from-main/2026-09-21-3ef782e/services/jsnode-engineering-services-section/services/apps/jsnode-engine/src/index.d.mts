import type ts from "typescript";

export interface JsnodeSourceRecord {
  readonly kind: "jsnode.source-record";
  readonly version: 1;
  readonly fileName: string;
  readonly language: "js" | "ts" | "jsx" | "tsx" | "json";
  readonly length: number;
  readonly digest: string;
}
export interface JsnodeSourceEdit { readonly start: number; readonly end: number; readonly text: string; }
export interface JsnodeModuleSpecifierRewritePlan {
  readonly kind: "jsnode.module-specifier-rewrite.plan";
  readonly version: 1;
  readonly source: JsnodeSourceRecord;
  readonly from: string;
  readonly to: string;
  readonly edits: readonly JsnodeSourceEdit[];
}
export interface JsnodePackageCollapseMapping {
  readonly files: readonly { readonly from: string; readonly to: string; }[];
  readonly packageExports: readonly { readonly specifier: string; readonly to: string; readonly replacement?: string; }[];
}
export interface JsnodePackageCollapsePlan {
  readonly kind: "jsnode.package-collapse.plan";
  readonly version: 1;
  readonly source: JsnodeSourceRecord;
  readonly outputPath: string;
  readonly eraseTypeScript: boolean;
  readonly edits: readonly JsnodeSourceEdit[];
}
export const JSNODE_ENGINE_SPECIFICATION: string;
export const jsnodeTypeScript: typeof ts;
export function readJsnodeAst(text: string, fileName: string): ts.SourceFile;
export function readJsnodeSourceRecord(text: string, fileName: string): JsnodeSourceRecord;
export function readJsnodeSyntax(text: string, fileName: string): unknown;
export function readJsnodeTokens(text: string, fileName: string): unknown;
export function readJsnodeModuleRequests(text: string, fileName: string): readonly { readonly kind: string; readonly specifier: string | null; readonly start: number | null; readonly end: number | null; }[];
export function readJsnodeRuntimeModuleRequests(text: string, fileName: string): readonly unknown[];
export function readJsnodeModuleExports(text: string, fileName?: string): { readonly names: readonly string[]; readonly hasStarExport: boolean };
export function visitJsnodeSyntax(text: string, fileName: string, visit: (node: ts.Node, parent: ts.Node | null, typescript: typeof ts) => void): void;
export function applyJsnodeSourceEdits(text: string, edits: readonly JsnodeSourceEdit[]): string;
export function planJsnodeModuleSpecifierRewrite(text: string, fileName: string, from: string, to: string): JsnodeModuleSpecifierRewritePlan;
export function applyJsnodeSourceEditPlan(text: string, fileName: string, plan: JsnodeModuleSpecifierRewritePlan): { readonly kind: "jsnode.source-edit.receipt"; readonly version: 1; readonly editCount: number; readonly text: string; };
export function planJsnodePackageCollapse(text: string, fileName: string, mapping: JsnodePackageCollapseMapping, options?: { readonly eraseTypeScript?: boolean; }): JsnodePackageCollapsePlan;
export function applyJsnodePackageCollapsePlan(text: string, fileName: string, plan: JsnodePackageCollapsePlan): { readonly kind: "jsnode.package-collapse.receipt"; readonly version: 1; readonly outputPath: string; readonly editCount: number; readonly text: string; };
