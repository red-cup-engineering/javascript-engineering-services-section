import assert from "node:assert/strict";
import test from "node:test";
import {
  admitArtifactFabricationRealizationPlan,
  admitArtifactFabricationSpecification,
  findArtifactFabricationEpistemicDebt,
  summarizeArtifactFabricationClaims,
} from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { JSNODE_PACKAGE_DIALECT_EXAMPLE } from "../src/jsnode-package.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";

const SHA = `sha256:${"b".repeat(64)}`;
const translate = (text) => translateMarkdownJsnodeOperationPackageSpecification({
  type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1,
  source: { type: "MarkdownDocumentSource", path: "fixtures/number-topic.md", text },
});

/** The dialect example, made an epistemic work order: its number, its refusal and its estimate are claims. */
function claimedOrder({ requirement = "The topic doubles within {{double-budget}}", prohibition = "Invalid inputs are refused [claims: refusal-follows]", dependencies = "{}", claims = null } = {}) {
  const claimLines = claims ?? [
    `- \`double-budget\` | measured | parameter | The measured time one doubling takes | 4 ms | fixtures/timing.json | ${SHA} | median of 30 runs`,
    "- `refusal-follows` | derived | world | A non-number input is outside the typed domain | none | constraint:node-esm; citation:JSON Schema 2020-12 type keyword | The input schema admits numbers only",
    "- `budget-holds` | conjectured | world | Doubling stays inside its budget at scale | 4 ms | Doubling time stays near the median at ten times the load | Latency per call under load | The package-birth assay timing | Keep the budget while the 99th percentile is within twice the median | The measured median",
  ].join("\n");
  return JSNODE_PACKAGE_DIALECT_EXAMPLE
    .replace("- `number-result`: The topic returns typed number results.", `- \`number-result\`: ${requirement}`)
    .replace("- `bad-input`: Invalid inputs are refused.", `- \`bad-input\`: ${prohibition}`)
    .replace("## Package", `## Claims\n${claimLines}\n## Package`)
    .replace('"dependencies":{}', `"dependencies":${dependencies}`);
}

test("a work order with claims translates to a version 2 candidate that the Data admission admits", () => {
  const translation = translate(claimedOrder());
  assert.equal(translation.type, "MarkdownJsnodeOperationPackageSpecificationTranslation", JSON.stringify(translation));
  const candidate = translation.artifactSpecificationCandidate;
  assert.equal(candidate.version, 2);
  assert.equal(candidate.claims.length, 3);
  const admitted = admitArtifactFabricationSpecification(candidate);
  assert.equal(admitted.type, "ArtifactFabricationSpecification", `${admitted.code} ${admitted.message}`);
  assert.deepEqual(summarizeArtifactFabricationClaims(admitted), { measured: 1, derived: 1, conjectured: 1, derivedOnConjecture: 0 });
  assert.deepEqual(admitted.requirements[0].parameters.map(({ name, value, unit, claimId }) => [name, value, unit, claimId]), [["double-budget", 4, "ms", "double-budget"]]);
  assert.deepEqual(admitted.acceptanceObligations[0].claimIds, ["budget-holds"], "the package assay schedules the conjecture's measurement");
  const plan = admitArtifactFabricationRealizationPlan(admitted, {
    type: "ArtifactFabricationRealizationPlanCandidate", version: 1, artifactId: admitted.artifact.id,
    specificationDigest: admitted.specificationDigest, projectionIds: ["jsnode-operation-package"], acceptanceObligationIds: ["jsnode-package-assays"],
  });
  assert.equal(plan.type, "ArtifactFabricationRealizationPlan");
});

test("without a Claims section the candidate stays version 1 and lists its migration debt", () => {
  const translation = translate(JSNODE_PACKAGE_DIALECT_EXAMPLE);
  assert.equal(translation.artifactSpecificationCandidate.version, 1);
  assert.deepEqual(findArtifactFabricationEpistemicDebt(translation.artifactSpecificationCandidate), [{ code: "RESTRICTION_WITHOUT_CLAIM", path: "prohibitions[0]" }]);
});

test("the law binds a translated work order: bare numbers, ungrounded refusals and measured evidence", () => {
  const code = (text) => { const candidate = translate(text).artifactSpecificationCandidate; return admitArtifactFabricationSpecification(candidate).code; };
  assert.equal(code(claimedOrder({ requirement: "The topic doubles within 4 ms" })), "PARAMETER_WITHOUT_CLAIM");
  assert.equal(code(claimedOrder({ prohibition: "Invalid inputs are refused" })), "RESTRICTION_WITHOUT_CLAIM");
  assert.equal(code(claimedOrder({ prohibition: "Invalid inputs are refused [claims: budget-holds]" })), "RESTRICTION_GROUNDED_ON_CONJECTURE");
  assert.equal(code(claimedOrder().replace(SHA, "sha256:0")), "MEASURED_CLAIM_WITHOUT_EVIDENCE");
  assert.equal(code(claimedOrder().replace("constraint:node-esm; citation:JSON Schema 2020-12 type keyword", "")), "DERIVED_CLAIM_WITHOUT_PREMISES");
});

test("a blocking question on a measurable conjecture is refused, not left to block the work", () => {
  const withBlocking = claimedOrder().replace("## Open questions\nnone", "## Open questions\n- `budget` [blocking]: Does doubling hold at scale? [claim: budget-holds]");
  assert.equal(admitArtifactFabricationSpecification(translate(withBlocking).artifactSpecificationCandidate).code, "BLOCKED_ON_MEASURABLE_CONJECTURE");
});

test("a dependency of a claimed work order needs a measured dependency claim naming name@version", () => {
  const dependency = '{"@red-cup-engineering/position-sizing-service":"0.2.0"}';
  const refused = translate(claimedOrder({ dependencies: dependency }));
  assert.equal(refused.type, "MarkdownJsnodeOperationPackageSpecificationTranslationRefusal");
  assert.equal(refused.code, "DEPENDENCY_WITHOUT_MEASURED_CLAIM");
  const claims = [
    `- \`double-budget\` | measured | parameter | The measured time one doubling takes | 4 ms | fixtures/timing.json | ${SHA} | median of 30 runs`,
    "- `refusal-follows` | derived | world | A non-number input is outside the typed domain | none | constraint:node-esm | The input schema admits numbers only",
    `- \`sizing-published\` | measured | dependency | @red-cup-engineering/position-sizing-service@0.2.0 is on the Group registry | none | data/npm-view.json | ${SHA} | npm view of the exact version`,
  ].join("\n");
  const accepted = translate(claimedOrder({ dependencies: dependency, claims }));
  assert.equal(accepted.type, "MarkdownJsnodeOperationPackageSpecificationTranslation", JSON.stringify(accepted));
  assert.equal(admitArtifactFabricationSpecification(accepted.artifactSpecificationCandidate).type, "ArtifactFabricationSpecification");
});

test("an unknown placeholder and a malformed claim are refused at translation with their lines", () => {
  const unknown = translate(claimedOrder({ requirement: "The topic doubles within {{nothing}}" }));
  assert.equal(unknown.code, "UNKNOWN_PARAMETER_PLACEHOLDER");
  const malformed = translate(claimedOrder({ claims: "- `broken` | measured | parameter | too few fields" }));
  assert.equal(malformed.code, "INVALID_CLAIM");
  assert.ok(malformed.sourceSpan.startLine > 1);
});

test("a definitionally exact constant is a placeholder without a claim", () => {
  const order = claimedOrder({ requirement: "The topic reports every {{seconds-per-minute}} seconds, within {{double-budget}}" });
  const admitted = admitArtifactFabricationSpecification(translate(order).artifactSpecificationCandidate);
  assert.equal(admitted.type, "ArtifactFabricationSpecification", `${admitted.code} ${admitted.message}`);
  assert.equal(admitted.requirements[0].parameters.find(({ name }) => name === "seconds-per-minute").exact, "seconds-per-minute");
});
