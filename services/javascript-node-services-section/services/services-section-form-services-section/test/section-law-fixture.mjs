import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw, readSourceOrganizations } from "../scripts/read-services-section-law.mjs";

const lawRoot = await findServicesSectionRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
export const law = await readServicesSectionLaw(lawRoot);
export const sourceOrganizations = await readSourceOrganizations(lawRoot);
export async function installSectionLaw(root) {
  const directory = resolve(root, "services/internal-services-section/data/records/schemas");
  await mkdir(directory, { recursive: true });
  const rules = resolve(root, "services/internal-services-section/lib/agency/rules");
  await mkdir(rules, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "services-section-form.schema.json"), JSON.stringify(law.schema)),
    writeFile(resolve(directory, "services-section-form-content-taxonomy.json"), JSON.stringify(law.contentTaxonomy)),
    writeFile(resolve(rules, "every-repository-package-and-section-has-one-home.json"), JSON.stringify({ sourceOrganizations })),
  ]);
}
