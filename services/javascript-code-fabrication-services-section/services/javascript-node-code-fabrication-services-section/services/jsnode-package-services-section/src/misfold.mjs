/**
 * Misfold detection for a derived JSNode module (stage 10 of the fabrication line, read at
 * derivation so the line refuses the misfold before it is born).
 *
 * Lenticule Science, 2026-07-24 "The Union EVM chain as a folding protein", section 5: "A misfold is
 * a wrapper, certificate, or subsystem deposited beside the territory instead of folded from the
 * proof." The fabrication line's high-level design (2026-10-10, section 4) reads it for code: a
 * module that re-exports or wraps a capability a declared dependency already exports adds nothing
 * the order needed; the order should use the dependency, or thicken it.
 *
 * Three shapes are read from the module's ESTree, on an operation's export only:
 * - re-export: `export { x as op } from "dep"` or `export * from "dep"`;
 * - alias: `export const op = x` where `x` is imported from a dependency;
 * - delegation: `export (async) function op(a, b) { return (await) x(a, b); }`, the body one return
 *   of a call to a dependency import with the operation's own parameters, in order.
 * A relative import is the package's own territory and never a misfold.
 */
import { readJsnodeAst } from "@red-cup-engineering/javascript-node-services-section/syntax";

const isDependency = (specifier) => typeof specifier === "string" && !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:");

/** Local names bound by imports from dependencies, each with its module request. */
function dependencyBindings(program) {
  const bindings = new Map();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || !isDependency(statement.source.value)) continue;
    for (const specifier of statement.specifiers) bindings.set(specifier.local.name, statement.source.value);
  }
  return bindings;
}

const unwrapAwait = (node) => (node?.type === "AwaitExpression" ? node.argument : node);

/** Whether a function only forwards its own parameters, in order, to one dependency binding. */
function delegatedTo(fn, bindings) {
  const body = fn.body;
  let returned;
  if (body.type !== "BlockStatement") returned = body;
  else if (body.body.length === 1 && body.body[0].type === "ReturnStatement") returned = body.body[0].argument;
  else return undefined;
  const call = unwrapAwait(returned);
  if (call?.type !== "CallExpression" || call.callee.type !== "Identifier" || !bindings.has(call.callee.name)) return undefined;
  const params = fn.params.map((param) => (param.type === "Identifier" ? param.name : null));
  const args = call.arguments.map((arg) => (arg.type === "Identifier" ? arg.name : null));
  if (params.includes(null) || args.includes(null) || params.length !== args.length || params.some((name, i) => name !== args[i])) return undefined;
  return bindings.get(call.callee.name);
}

/** The misfolds among a module's exports of `exportNames`: `[{ export, kind, dependency }]`. */
export function misfoldsOfModule(text, fileName, exportNames) {
  const program = readJsnodeAst(text, fileName);
  const bindings = dependencyBindings(program);
  const wanted = new Set(exportNames);
  const found = [];
  for (const statement of program.body) {
    if (statement.type === "ExportAllDeclaration" && isDependency(statement.source?.value)) {
      found.push({ export: "*", kind: "re-export", dependency: statement.source.value });
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.source && isDependency(statement.source.value)) {
      for (const specifier of statement.specifiers) {
        const name = specifier.exported.name ?? specifier.exported.value;
        if (wanted.has(name)) found.push({ export: name, kind: "re-export", dependency: statement.source.value });
      }
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const name = specifier.exported.name ?? specifier.exported.value;
      if (wanted.has(name) && bindings.has(specifier.local.name)) found.push({ export: name, kind: "alias", dependency: bindings.get(specifier.local.name) });
    }
    const declaration = statement.declaration;
    if (declaration?.type === "FunctionDeclaration" && wanted.has(declaration.id.name)) {
      const dependency = delegatedTo(declaration, bindings);
      if (dependency !== undefined) found.push({ export: declaration.id.name, kind: "delegation", dependency });
    }
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== "Identifier" || !wanted.has(declarator.id.name)) continue;
        const init = declarator.init;
        if (init?.type === "Identifier" && bindings.has(init.name)) found.push({ export: declarator.id.name, kind: "alias", dependency: bindings.get(init.name) });
        else if (["ArrowFunctionExpression", "FunctionExpression"].includes(init?.type)) {
          const dependency = delegatedTo(init, bindings);
          if (dependency !== undefined) found.push({ export: declarator.id.name, kind: "delegation", dependency });
        }
      }
    }
  }
  return Object.freeze(found.map((item) => Object.freeze(item)));
}

/** A refusal reason for a module's misfolds, or undefined when it folded. */
export function misfoldRefusal(misfolds) {
  if (misfolds.length === 0) return undefined;
  return "misfold: " + misfolds.map((item) => `${item.export} is a ${item.kind} of ${item.dependency}, deposited beside the capability it should use`).join("; ");
}
