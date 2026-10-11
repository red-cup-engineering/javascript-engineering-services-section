import { jsdocOf, parseJavaScript, parseJsdoc, walkJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";

/** The one kernel import every script carries: the operation face over computer-data types. */
export const KERNEL_SPECIFIER = "@red-cup-engineering/javascript-node-services-section/operation";
export const KERNEL_RUNNER = "runJavascriptNodeOperation";

const refused = (code, message) =>
  Object.freeze({ ok: false, refusal: Object.freeze({ code, message }) });

function isExported(node) {
  return node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration";
}

function unwrap(statement) {
  return (statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") && statement.declaration ? statement.declaration : statement;
}

function isMainGuard(statement, source) {
  if (statement.type !== "IfStatement") return false;
  const text = source.slice(statement.test.start, statement.test.end);
  return text === "import.meta.main" || text.includes("import.meta.url");
}

function declaredNames(statement) {
  const node = unwrap(statement);
  if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) return [node.id.name];
  if (node.type === "VariableDeclaration") return node.declarations.flatMap((d) => d.id.type === "Identifier" ? [d.id.name] : []);
  return [];
}

function identifiersIn(node, into) {
  walkJavaScript(node, (child) => { if (child !== node && child.type === "Identifier") into.add(child.name); });
}

function importBindings(statement) {
  return statement.specifiers.map((specifier) => specifier.local.name);
}

function firstSentence(text) {
  const flat = text.replace(/\s+/gu, " ").trim();
  const end = flat.search(/[.!?](\s|$)/u);
  return end === -1 ? flat : flat.slice(0, end + 1);
}

function descriptionOf(program, statement, fallback) {
  const block = jsdocOf(program, statement);
  const text = block ? parseJsdoc(block.value).description : "";
  return text.trim().length > 0 ? firstSentence(text) : fallback;
}

function guardReadsArguments(guard, source) {
  // The guard's own condition may name process.argv[1] to recognise the entry path; only the body's
  // reading of the argument vector is a face.
  const text = guard.type === "IfStatement" ? source.slice(guard.consequent.start, guard.consequent.end) : source.slice(guard.start, guard.end);
  const argv = text.replace(/process\.argv\.includes\("--help"\)/gu, "");
  return /process\.argv|cliArgument\(|parseArgs\(|parseJavascriptArgv|argv\b/u.test(argv);
}

/**
 * Projects one script onto the operation form: exactly one exported function becomes the
 * operation, the hand-written main guard is replaced by the kernel runner, and every top-level
 * declaration or import that only the old guard referenced is deleted. A script whose guard reads
 * its own argument vector is refused: its face is a migration decision, never a silent rewrite.
 */
export function projectScriptOntoOperation(source, fileName) {
  let program;
  try { program = parseJavaScript(source); } catch (error) { return refused("unparseable", error.message); }
  const statements = [...program.body];
  const fullStart = new Map(statements.map((s, i) => [s, i === 0 ? 0 : statements[i - 1].end]));
  const exportedFunctions = statements.filter((s) => s.type === "ExportNamedDeclaration" && s.declaration?.type === "FunctionDeclaration" && s.declaration.id !== null);
  const otherExports = statements.filter((s) => isExported(s) && !exportedFunctions.includes(s));
  if (exportedFunctions.length === 0 && otherExports.length === 0) return refused("zero-export-script-is-an-app", "a script with no exported operation is an app wearing a script's name");
  if (exportedFunctions.length !== 1 || otherExports.length > 0) return refused("more-than-one-export", `the operation form carries one exported function; found ${exportedFunctions.length + otherExports.length} exports`);
  const guard = statements.find((s) => isMainGuard(s, source));
  if (guard === undefined) return refused("no-main-guard", "no `import.meta` main guard to replace");
  if (source.slice(guard.start, guard.end).includes(KERNEL_RUNNER)) return refused("already-operation-form", "the script already runs through the kernel");
  if (guardReadsArguments(guard, source)) return refused("argv-face-needs-migration-decision", "the main guard reads the argument vector; its consumers must be migrated to the one JSON input before the face changes");

  const exportName = exportedFunctions[0].declaration.id.name;
  const operationName = fileName.split(/[\\/]/u).at(-1).replace(/\.[cm]?[jt]s$/u, "");
  const description = descriptionOf(program, exportedFunctions[0], `${exportName} — the ${operationName} operation.`);

  // Delete the guard, then every non-exported declaration and import binding nothing else references.
  const kept = new Set(statements.filter((s) => s !== guard));
  const removedDeclarations = [];
  const removedImports = [];
  let changed = true;
  while (changed) {
    changed = false;
    const referenced = new Set();
    for (const s of kept) {
      if (s.type === "ImportDeclaration") continue;
      const names = new Set(declaredNames(s));
      const inner = new Set();
      identifiersIn(s, inner);
      for (const id of inner) if (!names.has(id) || unwrap(s).type === "VariableDeclaration") referenced.add(id);
    }
    for (const s of [...kept]) {
      if (isExported(s)) continue;
      if (s.type === "ImportDeclaration") {
        const bindings = importBindings(s);
        if (bindings.length > 0 && bindings.every((b) => !referenced.has(b))) { kept.delete(s); removedImports.push(s.source.value); changed = true; }
        continue;
      }
      const names = declaredNames(s);
      if (names.length > 0 && names.every((n) => !referenced.has(n))) { kept.delete(s); removedDeclarations.push(...names); changed = true; }
    }
  }

  const shebang = source.startsWith("#!") ? source.slice(0, source.indexOf("\n") + 1) : "";
  const order = statements.filter((s) => kept.has(s));
  const hasKernelImport = order.some((s) => s.type === "ImportDeclaration" && s.source.value === KERNEL_SPECIFIER);
  const lastImport = order.map((s, i) => s.type === "ImportDeclaration" ? i : -1).reduce((a, b) => Math.max(a, b), -1);
  const pieces = [];
  order.forEach((s, i) => {
    const full = source.slice(fullStart.get(s), s.end);
    pieces.push(shebang && full.startsWith(shebang) ? full.slice(shebang.length) : full);
    if (i === lastImport && !hasKernelImport) pieces.push(`\nimport { ${KERNEL_RUNNER} } from "${KERNEL_SPECIFIER}";`);
  });
  if (lastImport === -1 && !hasKernelImport) pieces.unshift(`import { ${KERNEL_RUNNER} } from "${KERNEL_SPECIFIER}";\n`);
  const runner = [
    "",
    "if (import.meta.main) {",
    `  const result = await ${KERNEL_RUNNER}({ name: ${JSON.stringify(operationName)}, description: ${JSON.stringify(description)}, operation: ${exportName} }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });`,
    "  process.exitCode = result.exitCode;",
    "}",
    "",
  ].join("\n");
  const body = pieces.join("").replace(/\s+$/u, "");
  const text = `${shebang}${body.replace(/^\n+/u, "")}\n${runner}`;
  return Object.freeze({ ok: true, value: Object.freeze({ text, operationName, exportName, description, removedDeclarations: Object.freeze(removedDeclarations), removedImports: Object.freeze(removedImports) }) });
}
