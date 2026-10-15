export function directArguments(command) {
  const parts = String(command || "").trim().split(/\s+/u).filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^[A-Za-z0-9_./:@=+,%-]+$/u.test(part)) ? parts : null;
}

export function normalizeCommandResult(result) {
  return Object.freeze({
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || "",
    cancelled: result.signal !== null && result.status === null,
  });
}

export function normalizeVerificationResult(result) {
  return Object.freeze({
    passed: result.code === 0,
    output: `exit=${result.code}\n${result.stdout}\n${result.stderr}\n${result.error}`,
  });
}
