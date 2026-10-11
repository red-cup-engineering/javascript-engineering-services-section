# Deno services section

This is the authoritative home for live services whose execution, tooling, or
deployment contract depends on Deno.

Deno is a runtime and toolchain for JavaScript and TypeScript. In this
repository it is a sibling concern to Node.js within the broader JavaScript
ecosystem: service capability determines the outer hierarchy, while this
section owns the Deno-specific implementation and operating knowledge.

## Holdings

- `services/deno-deploy-free-compute-provider/` supplies authenticated,
  bounded edge computation on Deno Deploy.
- `services/jsnode-function-movement-cloud-provider/` supplies ephemeral Deno
  execution for deterministic JavaScript function movement.

## Boundaries

- The repository-root `deno.jsonc` and `deno.lock` coordinate the entire
  workspace and remain at repository root.
- General JavaScript and Node.js services remain direct holdings of the parent
  `javascript-engineering-services-section`.
- Historical records keep their original paths as evidence; they do not define
  the current service topology.
