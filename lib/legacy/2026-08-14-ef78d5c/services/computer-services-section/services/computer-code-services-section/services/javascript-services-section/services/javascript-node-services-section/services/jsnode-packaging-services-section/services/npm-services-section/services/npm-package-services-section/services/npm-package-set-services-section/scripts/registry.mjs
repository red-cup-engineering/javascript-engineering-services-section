import { observeNpmPackageDirectories } from "@red-cup-engineering/npm-package-directory-observation-service";
import { readNpmPackageSetInfo } from "@red-cup-engineering/read-npm-package-set-info-service";

export const registry = Object.freeze({
  models: Object.freeze({}),
  behaviors: Object.freeze({ observeNpmPackageDirectories, readNpmPackageSetInfo }),
  qualities: Object.freeze({}),
});
