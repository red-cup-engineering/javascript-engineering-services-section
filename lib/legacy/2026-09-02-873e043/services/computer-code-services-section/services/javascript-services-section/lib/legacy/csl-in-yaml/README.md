# @emsenn/csl-in-yaml

Author, lint, sort, and generate **CSL-in-YAML** citation blocks — CSL-JSON
bibliographic records living directly in Markdown frontmatter.

Zero runtime dependencies. Pure ESM. Node ≥ 20.

## What is "CSL-in-YAML"?

[CSL-JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html) is
the bibliographic data model consumed directly by Pandoc `citeproc`,
`citeproc-js`, Zotero, and Mendeley. When you write with
[Pandoc](https://pandoc.org/), you can embed those records as YAML in a
document's frontmatter and cite them in the body:

```markdown
---
title: The mathematical frontier of gases
references:
  - id: grad1958
    type: chapter
    author:
      - family: Grad
        given: Harold
    title: Principles of the kinetic theory of gases
    container-title: Handbuch der Physik
    issued:
      date-parts: [[1958]]
    DOI: 10.1007/978-3-642-45892-7_3
---

The moment method originates with @grad1958.
```

That pattern — one CSL-JSON entry per source in `references:`, cited in the body
as bare `@citekey` — is what this tool helps you write and keep clean.

The convention it enforces:

- every external work is **one CSL-JSON entry** in frontmatter `references:`;
- the `references:` array is **sorted by `id`** and ids are **unique**;
- citekeys are **`surnameYYYY`** (a lowercase surname, a 4-digit year, and an
  optional single trailing letter — no hyphens);
- the only in-body citation form is the **bare `@citekey`** — bracketed
  (`[@key]`), locator (`[@key, p. 5]`), and author-year (`(Grad 1958)`) forms
  are rejected;
- every `@citekey` in the body **resolves** to a `references` id;
- there is **no hand-written bibliography section** in the body — the
  bibliography is renderer output from the frontmatter.

## Install

```sh
npm install -g @emsenn/csl-in-yaml   # or run without installing:
npx @emsenn/csl-in-yaml --help
```

Or use it straight from a checkout — there is nothing to build:

```sh
node scripts/cli.mjs --help
```

## CLI

```
csl-in-yaml <command> [options]

  lint      <path...>   Check citation discipline in Markdown documents
  validate  <path...>   Validate frontmatter references against CSL-JSON
  sort      <path...>   Sort & normalize a document's references array
  parse     [text]      Convert free-form citation text into CSL-JSON YAML
```

### `parse` — free-form citation → CSL-JSON

Paste a rough bibliography and get CSL-JSON entries you can drop into
`references:`. Reads positional text, `--file`, or stdin (one citation per line).

```sh
csl-in-yaml parse 'Fitting, Melvin (1991). "Bilattices and the Semantics of Logic Programming." *Journal of Logic Programming* 11(2), 91–116.'
```

```yaml
references:
  - id: fitting1991
    type: article-journal
    author:
      - family: Fitting
        given: Melvin
    title: Bilattices and the Semantics of Logic Programming
    container-title: Journal of Logic Programming
    issued:
      date-parts: [[1991]]
    volume: 11
    issue: '2'
    page: 91-116
```

The parser recognizes journal articles, book chapters, books, arXiv preprints,
RFCs, IEEE/ISO standards, WHATWG/W3C living standards, and corporate
documentation. Each parse carries a confidence:

| flag | keeps |
| --- | --- |
| `--min-confidence high` | only unambiguous parses |
| `--min-confidence medium` *(default)* | + no-volume articles, living docs |
| `--min-confidence low` | + descriptive/free-form fallbacks |

Skipped and unparsable lines are reported on stderr so nothing is dropped
silently. Use `--json` for machine output and `--now YYYY-MM-DD` to fix the
access date used for living documents.

### `lint` — citation discipline

```sh
csl-in-yaml lint notes/**/*.md -r
```

Prints findings and exits `1` if any error-severity finding is present, so it
drops straight into CI or a pre-commit hook. `--json` for machine output.

### `sort` — normalize references

```sh
csl-in-yaml sort paper.md --write     # sort by id, order fields, write back
csl-in-yaml sort paper.md --check     # exit 1 if it would change (for CI)
csl-in-yaml sort paper.md             # print the normalized document to stdout
```

Sorts entries by `id` and orders each entry's fields into a stable, diff-friendly
shape.

### `validate` — schema check

```sh
csl-in-yaml validate paper.md
```

Validates every `references` entry against the CSL-JSON contract: required
fields, the CSL 1.0.2 type vocabulary, name/date shapes, and per-type
requirements (e.g. `article-journal` needs `container-title`, `webpage` needs
`URL` + `accessed`). Exits `1` on any invalid entry.

## Library API

```js
import {
  splitDocument, joinDocument,
  lintDocument, validateReferences, sortReferences,
  parseCitation, parseCitations,
  parseYaml, dumpYaml
} from '@emsenn/csl-in-yaml';

const { frontmatter, body } = splitDocument(markdownText);
const { findings } = lintDocument({ frontmatter, body });
const { entries } = parseCitations(roughText, { minConfidence: 'high' });
```

The bundled YAML reader/writer (`parseYaml` / `dumpYaml`) supports the block
subset that frontmatter and CSL reference blocks use (block mappings and
sequences, flow collections, quoted scalars, block scalars, comments). It is
not a general YAML 1.2 implementation and raises `YamlError` on unsupported
constructs rather than guessing.

## Development

```sh
node --test        # run the suite (zero dependencies)
```

## License

MIT. This repository is currently private; the package is written to be
suitable for public release.
