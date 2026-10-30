// sort.mjs — normalize a document's references array: sort by id (ASCII) and
// order each entry's fields into the canonical, diff-stable shape.

import { compareIds, orderEntry } from './csl.mjs';

// Returns { frontmatter, changed } with references sorted and field-ordered.
// The input frontmatter is not mutated.
export const sortReferences = (frontmatter) => {
  const refs = frontmatter?.references;
  if (!Array.isArray(refs)) return { frontmatter, changed: false };

  const ordered = refs.map((e) => (typeof e === 'object' && e !== null && !Array.isArray(e) ? orderEntry(e) : e));
  const sorted = ordered
    .map((e, i) => [e, i])
    .sort((a, b) => {
      const ia = a[0] && a[0].id, ib = b[0] && b[0].id;
      if (typeof ia === 'string' && typeof ib === 'string') return compareIds(ia, ib) || (a[1] - b[1]);
      return a[1] - b[1];
    })
    .map(([e]) => e);

  const changed = JSON.stringify(sorted) !== JSON.stringify(refs);
  const next = { ...frontmatter, references: sorted };
  return { frontmatter: next, changed };
};
