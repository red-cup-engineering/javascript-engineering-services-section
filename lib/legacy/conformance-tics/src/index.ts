// @red-cup-engineering/conformance-tics — live package-conformance service.
// Accepts a list of package paths at startup; serves an HTML audit of each
// on demand by running conformance-computer checkPackage per request.

import type { App } from "@red-cup-engineering/http-server";
import { htmlRepr, jsonRepr } from "@red-cup-engineering/http-server";
import {
  lintPackage as checkPackage,
  type PackageLintReport as CheckReport,
} from "@emsenn/jsnode-ick/package-lint";

export type { CheckReport };

/** Service startup projection: the configured package paths select which
 *  package carriers `checkPackage` reads and settles into charged findings.
 *  This config is routing for the live audit surface, not an independent data
 *  model. */
export type ConformanceTicsConfig = Readonly<{
  paths: readonly string[];
  repoRoot?: string | undefined;
}>;

const MARKS: Readonly<Record<string, string>> = {
  potential: "+", active: "!", stable: "#", absurd: "·",
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderIndex(paths: readonly string[]): string {
  const items = paths
    .map((p) => `<li><a href="/audit/${encodeURIComponent(p)}">${escHtml(p)}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>conformance-tics — live package audit</title>
<style>body{font-family:monospace;max-width:80ch;margin:2rem auto}h1{margin-bottom:.5rem}</style>
</head><body>
<h1>conformance-tics</h1>
<p>Live package conformance audit. Findings are charges: + potential  ! active  # stable  · absurd</p>
<ul>${items}</ul>
</body></html>`;
}

function renderAudit(report: CheckReport): string {
  const rows = report.findings.map((f) => {
    const mark = MARKS[f.charge] ?? "?";
    const ev = f.evidence.length > 0
      ? `<ul>${f.evidence.map((e) => `<li><code>${escHtml(e)}</code></li>`).join("")}</ul>`
      : "";
    return `<tr><td>${mark}</td><td>${escHtml(f.norm)}</td><td>${escHtml(f.charge)}</td><td>${escHtml(f.message)}${ev}</td></tr>`;
  }).join("\n");
  const s = report.settled;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>conformance-tics — ${escHtml(report.packageDir)}</title>
<style>body{font-family:monospace;max-width:120ch;margin:2rem auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.2rem .5rem;border-bottom:1px solid #ccc}</style>
</head><body>
<h1>${escHtml(report.packageDir)}</h1>
<p>[${escHtml(report.layer)}] +${s["potential"] ?? 0} !${s["active"] ?? 0} #${s["stable"] ?? 0} ·${s["absurd"] ?? 0}</p>
<table><thead><tr><th></th><th>invariant</th><th>charge</th><th>finding</th></tr></thead>
<tbody>${rows}</tbody></table>
<p><a href="/">← all packages</a></p>
</body></html>`;
}

function renderError(status: number, message: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${status}</title></head><body>
<h1>${status}</h1><p>${escHtml(message)}</p><p><a href="/">← all packages</a></p>
</body></html>`;
}

function auditMatcher(urlPath: string): Record<string, string> | null {
  const m = /^\/audit\/(.+)$/.exec(urlPath);
  return m ? { encodedPath: m[1] ?? "" } : null;
}

export function createConformanceTicsApp(config: ConformanceTicsConfig): App {
  const { paths, repoRoot } = config;
  const pathSet = new Set(paths);

  return {
    resources: [
      {
        match: "/health",
        methods: ["GET"],
        produces: ["application/json"],
        handler: () => jsonRepr({ status: "ok", packages: paths.length }),
      },
      {
        match: "/",
        methods: ["GET"],
        produces: ["text/html"],
        handler: () => htmlRepr(renderIndex(paths)),
      },
      {
        match: auditMatcher,
        route: "/audit/:encodedPath",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx) => {
          const encoded = ctx.params["encodedPath"] ?? "";
          const pkgPath = decodeURIComponent(encoded);
          if (!pathSet.has(pkgPath)) {
            return htmlRepr(renderError(404, `Package path not registered: ${pkgPath}`), 404);
          }
          try {
            const report = await checkPackage(pkgPath, repoRoot);
            return htmlRepr(renderAudit(report));
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return htmlRepr(renderError(500, msg), 500);
          }
        },
      },
    ],
  };
}
