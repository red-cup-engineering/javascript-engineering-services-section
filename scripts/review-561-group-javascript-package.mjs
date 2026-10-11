#!/usr/bin/env node
import { reviewJsnodePackageDirectory } from "@red-cup-engineering/javascript-normalization-services-section/review-jsnode-package";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Review exactly one 561 Group JavaScript package without changing it. Run this before using, extending, moving, or creating a package. Any deviation is a stop signal for repository discovery, especially a package or service name that does not resolve to an actual owner in the 561 Group services section or its upstream engineering services. Inspect the owning section, upstream package, package keywords, consumers, and nearby conformance tests before deciding whether the package is usable or represents debt to repair.
 * @summary Reviews ownership, naming, and structural conformance before changing a 561 Group JavaScript package.
 * @param {string} packageDirectory The package directory to review.
 * @returns {object} The package directory, observed deviations, and normalized manifest.
 */
export function review561GroupJavascriptPackage(packageDirectory) {
  const review = reviewJsnodePackageDirectory(packageDirectory);
  return { packageDirectory, deviations: review.deviations, normalizedManifest: review.normalizedManifest };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "review-561-group-javascript-package", description: "Review exactly one 561 Group JavaScript package without changing it.", operation: review561GroupJavascriptPackage }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
