# Vendored imports

Vendored-by-copy snapshots of four `emsenn/*` GitHub repos, pulled in 2026-07-30 as import
candidates for enrichment. Each is a plain file copy (no `.git`) of a `--depth 1` clone at
the commit SHA below — not a submodule, not linked into `pnpm-workspace.yaml`, and not
registered anywhere. Nothing here has been `npm install`ed or wired into any workspace or
the registry. The five JSNode-specific snapshots moved with their noun to
`services/javascript-node-services-section/lib/vendored/`.

| repo | origin | commit SHA | vendored | purpose |
|---|---|---|---|---|
| javascript-computer | https://github.com/emsenn/javascript-computer | `156b3258b368f67b31c167d636be6db8aa8d40d3` | 2026-07-30 | JavaScript computer — projects a TypeScript declaration surface (.d.ts) into the javascript type category: a TypeCatalog of objects, morphisms, and subtype edges read from real source via the TypeScript compiler API. |
| javascript-algebra | https://github.com/emsenn/javascript-algebra | `f791ce24f728ab0d245720a91e987a0fcc53fec7` | 2026-07-30 | JavaScript type category — types as objects, functions as morphisms (a multicategory of types, domain is a tuple), and assignability as the carrier relation. Pure structure and operation; closures and section reads live in @emsenn/javascript-topology. |
| meme-topology | https://github.com/emsenn/meme-topology | `6cfec2b9dcf548589c9d6c68b0229e3956154b74` | 2026-07-30 | Meme topology as an inductive carrier and morphism derivation. |
| csl-in-yaml | https://github.com/emsenn/csl-in-yaml | `f032e3e1a7f4a8563b5500021229edab1f69925a` | 2026-07-30 | Author, lint, sort, and generate CSL-in-YAML citation blocks — CSL-JSON bibliographic records living in Markdown frontmatter. Zero dependencies. |

These are import candidates for enrichment — not yet wired into any workspace or registry.
