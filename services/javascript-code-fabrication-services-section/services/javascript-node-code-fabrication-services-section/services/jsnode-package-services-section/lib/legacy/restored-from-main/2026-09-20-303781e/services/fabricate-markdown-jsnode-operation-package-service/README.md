# Fabricate Markdown JSNode operation package

This service translates a closed Markdown work order, admits its artifact
specification, selects its JSNode projection, and creates the topic package
through `create-jsnode-operation-package-service`. It preserves the source
digest, source spans, and traceability in the resulting specification and
receipt. The package-birth assays cover syntax, authored tests, each
operation's direct NDJSON, imports, and application faces through a tarball
installed in a clean directory.

The fabricator creates development packages by default. Registry publication
is disabled unless the API request sets `publish: true` or the CLI receives
`--publish`; either route then invokes the full
`npm-workspace-publication-service` gate. Fabrication does not activate or
deploy the package, and ordinary tests do not publish it.

## Request

```js
{
  type: "MarkdownJsnodeOperationPackageFabricationRequest",
  version: 1,
  source: { type: "MarkdownDocumentSource", path: "/absolute/work-order.md", text: markdown },
  destination: "/absolute/absent/topic-package-service",
  registry: "http://127.0.0.1:4873",
  publish: true // optional; publication is disabled when omitted
}
```

The result is a `MarkdownJsnodeOperationPackageFabricationReceipt` or a
phase-specific `MarkdownJsnodeOperationPackageFabricationRefusal`. Creation
requires an absent destination; an existing one is refused with
`DESTINATION_EXISTS`. In-place revision is not supported.

The result records the source and specification digests, the immutable JSNode
creation receipt, registry publication evidence when requested, the receipt
path, and realization/acceptance evidence. A successful fabrication receipt
does not accept, activate, or deploy the package.

## CLI

```text
fabricate-markdown-jsnode-operation-package <work-order.md> <absolute-destination> <registry-url> [--publish]
```

Without `--publish`, the CLI fabricates without registry publication. With
`--publish`, it uses the same full publication gate as the API.
