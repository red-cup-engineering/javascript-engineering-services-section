import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../scripts/serve-a2a.mjs", import.meta.url), "utf8");
const unit = readFileSync(new URL("../ops/systemd/software-program-synthesis-service.service", import.meta.url), "utf8");

test("the synthesis provider has a noncolliding live boundary wired to its providers", () => {
  assert.match(server, /process\.env\.PORT \?\? "19847"/);
  assert.match(unit, /^Environment=PORT=19847$/m);
  assert.match(unit, /^Environment=BASE_URL=http:\/\/127\.0\.0\.1:19847$/m);
  assert.match(unit, /^Environment=INFERENCE_WORK_LOT_AGENT_CARD_URL=http:\/\/127\.0\.0\.1:8796\/\.well-known\/agent-card\.json$/m);
  assert.match(unit, /^Environment=SOFTWARE_MISSION_EXECUTION_AGENT_CARD_URL=http:\/\/127\.0\.0\.1:8797\/\.well-known\/agent-card\.json$/m);
  assert.match(unit, /^Environment=UNION_HIERARCHICAL_CIRCUIT_EQUIVALENCE_AGENT_CARD_URL=http:\/\/127\.0\.0\.1:19825\/\.well-known\/agent-card\.json$/m);
  assert.match(unit, /^Requires=.*inference-work-lot-service\.service.*hierarchical-circuit-equivalence-assay\.service.*bare-cedar-fog-software-mission-execution\.service$/m);
});
