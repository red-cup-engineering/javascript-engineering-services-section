import { access, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { findAncestorMarkerFile } from "@red-cup-engineering/computer-filepath-engineering-services-section/find-ancestor-marker-file";

/** The Group's internal section, where its law is kept. */
const GROUP_SECTION_PATH = "services/internal-services-section";

/** The Group's internal section in exactly this repository. */
const groupSectionAt = async (repositoryRoot) => {
  const directory = resolve(repositoryRoot, GROUP_SECTION_PATH);
  await access(directory);
  return directory;
};

/** Resolve the repository containing a selected directory; never select a machine's home checkout. */
export async function findServicesSectionRepositoryRoot(start) {
  const selected=await realpath(resolve(start));
  const found=(await findAncestorMarkerFile({ start:selected, marker: GROUP_SECTION_PATH })).path;
  // An explicitly materialized forest may carry its own law beneath owner
  // state. Preparation data without one cannot borrow an enclosing house's
  // source and turn a fixture or retained snapshot into a founding target.
  return found!==null && relative(found,selected).split(sep).includes('data') ? null : found;
}

/** Read the Group's law from exactly the supplied repository, before any dependent write. */
export async function readServicesSectionLaw(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) throw new TypeError("services-section law requires a repository root");
  const directory = resolve(await groupSectionAt(repositoryRoot), "data/records/schemas");
  const [schema, contentTaxonomy] = await Promise.all([
    readFileText(resolve(directory, "services-section-form.schema.json")).then(JSON.parse),
    readFileText(resolve(directory, "services-section-form-content-taxonomy.json")).then(JSON.parse),
  ]);
  return { schema, contentTaxonomy };
}

/** Read the custody-to-organization binding from the Group's one-home rule in exactly the supplied repository. */
export async function readSourceOrganizations(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.length === 0) throw new TypeError("source organizations require a repository root");
  const rulePath = resolve(await groupSectionAt(repositoryRoot), "lib/agency/rules/every-repository-package-and-section-has-one-home.json");
  const rule = JSON.parse(await readFileText(rulePath));
  if (rule?.sourceOrganizations === null || typeof rule?.sourceOrganizations !== "object") throw new TypeError(`${rulePath} holds no sourceOrganizations`);
  return Object.freeze({ ...rule.sourceOrganizations });
}
