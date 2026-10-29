# Javascript normalization services section

Groups services that normalize JavaScript packages and code toward standard forms.

## Services

- `services/review-jsnode-package-service` — reviews one package's manifest and file
  list, returning the normalized manifest and any deviations from standard form.

## Related published capabilities

Manifest normalization is composed from `@red-cup-engineering/npm-package-manifest-normalization-service`,
which chains identity application, version normalization, pnpm declaration removal,
and lifecycle-command normalization.
