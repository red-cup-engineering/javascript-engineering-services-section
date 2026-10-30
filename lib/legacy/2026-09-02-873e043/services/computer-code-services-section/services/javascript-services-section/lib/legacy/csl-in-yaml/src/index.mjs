// index.mjs — public API for csl-in-yaml.
//
// Programmatic entry points; the CLI in scripts/cli.mjs is a thin wrapper over these.

export { parse as parseYaml, dump as dumpYaml, YamlError } from './yaml.mjs';
export { splitDocument, joinDocument } from './frontmatter.mjs';
export {
  CSL_TYPES, isCslType, CITEKEY_RE, isCitekey, orderEntry, issuedYear, cslDate,
  isValidName, nameFromString, surnameToken, makeCitekey
} from './csl.mjs';
export { validateEntry, validateReferences } from './validate.mjs';
export { lintDocument, lintFrontmatter, lintBody } from './lint.mjs';
export { sortReferences } from './sort.mjs';
export { parseCitation, parseCitationFragment, parseCitations, passesConfidence } from './parse-citation.mjs';
