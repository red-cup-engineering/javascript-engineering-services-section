import { realpathSync as real } from "node:fs";
import { fileURLToPath as path } from "node:url";

export function isMain(url, entry = process.argv[1]) {
  try { return real(path(url)) === real(entry); } catch { return false; }
}

export function isStrictMain(url, entry = process.argv[1]) {
  try { return path(url) === entry; } catch { return false; }
}

export async function runMain(main, {
  moduleUrl: url,
  argv = process.argv,
  stdout = process.stdout,
  stderr = process.stderr,
  isEntry = isMain,
  formatResult,
  formatError = (error) => `${error?.message ?? error}\n`,
  exitCode = 2,
} = {}) {
  if (isEntry(url, argv[1])) try {
    const result = await main({ argv: argv.slice(2), stdout, stderr });
    if (formatResult) stdout.write(formatResult(result));
    return result;
  } catch (error) {
    stderr.write(formatError(error));
    process.exitCode = exitCode;
  }
}

export function runJsonMain(main, moduleUrl, options = {}) {
  return runMain(main, {
    ...options,
    moduleUrl,
    isEntry: isStrictMain,
    formatResult: (result) => `${JSON.stringify(result)}\n`,
    formatError: (error) => `refused: ${error?.message ?? error}\n`,
    exitCode: 78,
  });
}
