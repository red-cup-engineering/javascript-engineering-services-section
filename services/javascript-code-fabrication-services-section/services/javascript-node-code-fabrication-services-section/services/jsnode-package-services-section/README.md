# JSNode fabrication

`projectJsnodeModules` projects ESM source modules, explicit JSON Schemas, and an
optional catalog CLI from a module specification. Operations bind a name to an
export from a source module. Multiple operations may use the same module; local
helper imports remain local imports. No package, build, or per-function command
wrapper is required by the module projection.

The specification contract is
`data/records/schema/jsnode-module-specification.schema.json`. Input and output
schemas are supplied explicitly. Missing schemas remain unspecified; JSDoc does
not establish a runtime data contract. NDJSON belongs to the optional command
interface, while module functions receive and return JavaScript values.

The package admission, projection, and creation operations add optional npm
packaging around that same module projection. A package specification with
`cli: null` produces no CLI and injects no command runtime dependency. Legacy
function-source work orders are normalized into module bindings. The creator
checks declared examples, runs authored and generated contract tests, packs and
clean-installs the result, and executes its exported functions and any requested
catalog command before materializing an absent destination.

The Markdown translator accepts source fences, operation bindings, tests,
examples, and the work order's requirements and traceability. Bindings carry
`name`, `module`, `exportName`, `description`, and optional `inputSchema` and
`outputSchema`. Examples refer to binding names, allowing two operations to
share one source module. `JSNODE_PACKAGE_DIALECT_EXAMPLE` is executable through
translation, admission, projection, and creation.

The composed Markdown fabricator retains source-to-result receipts and its MCP
interface. Registry publication remains a separate, explicitly requested effect.

For sourced requirements targeting an existing consumer, `translate_work_order`
also accepts the [source-free module order](examples/source-free-module-order.md).
Its headings are the title, Requirements, Prohibitions, Laws, Standards,
Open questions, Modules, Acceptance obligations, and Traceability, in that order.
Modules contains one JSON fence with `operations`, `examples`, and exact
`dependencies`. Acceptance obligations contains one JSON array of
`{ id, kind, statement }` records supplied by the order's author. Traceability
names the `jsnode-modules` projection and those explicit obligations. No package
metadata, authored source, test source, CLI, destination, install or publication
obligation is introduced. The example is a controlled contract, not live demand.
Pass the returned `artifactSpecificationCandidate` unchanged to
`derive_jsnode_modules`; translation proposes data, and the fabricator admits
the canonical order before purchasing inference. Derivation and independent
consumer receiving remain distinct. Package orders retain their own obligations.

For an existing consumer, call fabrication MCP `derive_jsnode_modules` with
`{ "workOrder": <ArtifactFabricationSpecificationCandidate> }`. The canonical
order's artifact kind and sole projection ID are `jsnode-modules`; its target is
`@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure`.
The projection configuration contains only `operations`, `examples`, and exact
`dependencies`. Operations require input and output schemas; examples contain
`name`, `operation`, `input`, and `output`. The original requirements,
prohibitions, law/standard constraints, receiving obligations and traceability
remain part of that order.

Admission returns a `JsnodeModuleProposal` binding the unchanged admitted order
and realization plan to proposed modules/schemas, prior assay material,
dependencies and supplier provenance. Module derivation requires no Markdown
wrapper, authored source, tests, npm identity, CLI catalog, destination or
registry. It creates no package and does not rewrite the order with its source.
A legacy package order carries different obligations: translating it does not
authorize silently discarding packaging requirements to obtain a module order.

A proposal is not application or acceptance. Independently receive its behavior
and authorize exact source transitions through the existing work carrier before
applying it to a consumer. Source-free derivation requires exact dependencies
already installed in a host-supplied project (`dependencyProjectRoot` in the code
carrier; the native host defaults it to its bound repository). Installed package
identity is inspected before inference and again before executing the hidden
assays. The temporary assay links those packages; it does not install, pack or
publish them. An unavailable context returns `ASSAY_CONTEXT_UNAVAILABLE` before
either purchase. A context changed during inference returns
`ASSAY_CONTEXT_CHANGED`, retaining the source delivery as unassayed without a
negative supplier judgment. Behavioral evidence is no longer deferred to npm
birth. Historical `deferred` records retain their original weaker meaning.
Exact name/version observations do not prove immutable dependency contents or
standards conformance; those remain distinct receiving obligations.
Successful proposals await consumer receiving before their provider lots can be
judged accepted. The separate Markdown package fabricator retains its package birth boundary.

For the separate Markdown package dialect, a source-free v2 order omits `Sources` and `Tests`, and supplies explicit input
and output schemas. The fabricator admits that order and its realization plan
before calling a supplied inference carrier. A separate clause-assay delivery proposes case data from the requirements and
prohibitions. SignStuff schema admission checks those data, and deterministic
projection produces executable tests from the admitted examples and clause
cases before source derivation. The source writer sees the original order and
examples, but not the extra cases. Each declared module is derived once with all
its specified exports. An unresolved question or failed assay returns a refusal;
the fabricator does not buy a repair or retry a rejected candidate. The Group host
composes the same inference market used by its inference MCP surface into its
fabrication surface when both are enabled.

New source-free `JsnodeClosureDerivation@3` receipts retain `workOrderSpecification` and
`workOrderSpecificationDigest` separately from the specification containing
derived source and tests. Receiving re-admits the order and checks that removing
only generated source and tests from the realization recovers that exact order.
The receipt also binds the prior clause cases to the deterministically projected
tests and checks their derivation order. Clause-ID coverage is not proof that
every natural-language obligation is satisfied. The EAVT fold carries the
order's digest to the consumer. Historical v1 and v2 derivation
receipts retain their original evidence; v1 does not witness pre-inference
admission, and neither historical version proves the v3 clause-assay binding. These receipts establish their stated bindings and assays, rather
than organizational acceptance or deployment.


## Select independent execution methods

The native `fabrication-derive-jsnode-modules` and
`fabrication-fabricate-jsnode-operation-package` operations, and their MCP
projections, accept optional `inferenceMethods.assays` and
`inferenceMethods.source`. Each stage may select its own `workPlacement`,
`considerationPolicy`, `agentBounds`, and `requiredQualityTiers` using the
existing market contracts. Inspect the current supplier configuration identity
before placing work; a catalog entry does not demonstrate usable delivery or
available quota.

For example, these are request bounds, not a complete work order or a provider
recommendation:

```json
{
  "path": "path/to/original-work-order.md",
  "inferenceMethods": {
    "assays": { "agentBounds": { "maximumRequests": 1, "maximumOutputTokens": 2048 } },
    "source": { "agentBounds": { "maximumRequests": 1, "maximumOutputTokens": 4096 } }
  }
}
```

Optional `reasoning_effort`, nonnegative `reasoning_budget`, and the closed
`chat_template_kwargs` are admitted supplier-specific chat controls. Use them
only when the selected supplier/model documents their meanings. No reasoning
control is selected by default. The fixed host placement, consideration, and
execution bounds take precedence over caller choices; native customer admission
still governs purchases. Method choices cannot replace the order, generated
prompt, output schema, task classification, model ownership, or authority.
Requests require text output rather than a descriptive “code” capability label;
the consumer admits the candidate data and assays the code locally.

These declarations describe source capability. Confirm the installed native or
MCP catalog accepts this input before invoking it on a serving node. Record the
original order, each stage's lot, measured consumption, and separate delivery
judgments. An output limit reached with reasoning alone is a failed artifact
delivery, not evidence that a larger budget will realize the work. A refused
source does not invalidate a separately admitted assay delivery, and neither
admits application to a production consumer.

## Source-free connected module fabrication

### Host-isolated pre-assay (required for source-free derivation)

The module fabricator **does not spawn Node on supplier-generated code**. Its
`deriveJsnodeModules` / `deriveJsnodePackageFromClosure` operations require a
host-composed function named `isolatedAssayExecutor`. Without it they return
`ISOLATED_ASSAY_UNAVAILABLE` *before purchasing inference*. It is not a
customer-supplied serialization field or an alternative generic shell runner.

The existing fabricator now passes one connected, bounded request containing
projected `src/` modules and deterministic `test/` files, exact declared
dependency locations, test paths and test names. The request explicitly
requires no network or writable host workspace and a 30-second maximum.
The effectful execution provider must impose those conditions in a real
isolated Guix/LAGOON runtime: mount the admitted dependencies read-only, give
only an ephemeral writable scratch tree, omit credentials/network, cap CPU,
RAM and process count, and terminate the complete process group on completion
or failure. Return a bounded `{ isolated: true, status, stdout, stderr,
signal?, timedOut?, truncated? }` from the host's verified execution—not
from an arbitrary model-supplied object. The boolean is a host-observation
claim, **not itself a proof of sandbox security**.

The pure recipient rejects abnormal/partial execution, missing expected
tests, test skips, and the Node early-exit-zero false positive. A controlled
local Node runner exists solely in `test/fixtures/` for fixed test source;
it is **not** a production execution alternative. Host integration and real
negative controls remain required before treating untrusted generated source
as safely executable.



A `jsnode-modules` order declares every operation, its module, schemas, examples,
exact dependencies, clauses and independent receiving obligations. The native
`fabrication-derive-jsnode-modules` operation admits that order before inference.
Clause assays are derived first and hidden from source suppliers. Each declared
module is supplied once; relative imports may use the other declared modules.
The existing module projector validates the complete source/import closure, then
one temporary consumer executes every admitted example and prior clause assay.
An incomplete or failing composition is refused as a whole, without automatic
repair purchases or attributing an interaction failure to one arbitrary supplier.
The result retains the original order, source lots and assay evidence; it remains
a proposal for an independent receiver, not accepted or deployed software.
