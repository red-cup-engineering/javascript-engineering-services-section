# claude-infotics — capability coverage vs. prior claude-harness experiments

The goal: **earn the right to delete every prior experimental claude-harness
package** by proving `claude-infotics` (with MetroPlat upstream) meets-or-beats
each of their capabilities. This file is the audit.

Prior packages reviewed in full (source read, not skimmed):

- `archive/2026-06-08-llm-claude-harness` — MCP hub server (3 files)
- `archive/2026-07-02-organizing-with-claude` — topology / harness / inference / session (12 files)
- `archive/2026-07-02-organizing-with-claude-code-cli` — the `claude` binary driver (9 files)
- `archive/2026-07-02-organizing-with-claude-code-in-vs-code` — VS Code cockpit (1 file)

> **Architecture correction (this session).** claude-infotics was first built as
> a standalone toolkit that re-implemented spawn/parse/bin — the opposite of
> "downstream of MetroPlat." It was rebuilt as an **MetroPlat application**: its
> Claude capabilities are authored as `Operation`s over the platform boundary
> (`operation()`, `runProcessCommand`, `anthropicMessagesInferenceSource`,
> capability governance), composed with reused platform operations, and the
> CLI/HTTP/MCP faces are derived by the platform. The table below reads against
> that architecture.

Status legend: **PROVEN** (covered + exercised against reality), **COVERED**
(covered + unit-tested), **SUPERSEDED** (MetroPlat or claude-infotics does it a
better way), **DEAD** (only consumer is a retired stack; no live caller),
**HOLD-OUT** (genuinely not yet covered — blocks deleting that specific module).

## Capability map

| # | Prior capability | Prior location | claude-infotics | Status | Evidence |
|---|------------------|----------------|-----------------|--------|----------|
| 1 | Typed argv builder over full `claude` flag surface | cli `exec.buildClaudeArgs` | `operations/run.claudeArgv` | COVERED | unit-tested (flags first, prompt as trailing positional) |
| 2 | Spawn `claude -p`, collect stdout/stderr/code/events | cli `exec.runClaudePrint` | `claude-run` op → `runProcessCommand` | **PROVEN** | drove real `claude` through the derived surface. NOTE: the prompt is a trailing positional, not stdin — `runProcessCommand` is a `spawnSync` boundary with no stdin channel. |
| 3 | Live output while the run is in flight | cli `exec.runClaudePrint` `onStdout`/`onStderr` raw-chunk callbacks | *(none)* | **REGRESSION — OWED** | The archive streamed raw chunks; an interim standalone build of this package streamed **parsed** events (18, live, proven) — the platform rebuild LOST BOTH. `runProcessCommand` is `spawnSync` (blocking, no chunk callback), and an `Operation.run` returns one value, not a stream: **request/response operations cannot express a streaming run.** Fixing it means either spawning async inside the operation and journaling events as they land (caller still gets the summary), or a streaming surface the platform does not currently offer. Not papered over. |
| 4 | Parse `--output-format json`/`stream-json` → typed events + result | cli `events.parseClaudeEvents/resultEventOf` | `operations/events.mts` | COVERED | unit-tested on both envelopes; folds real transcripts (437 tool uses) |
| 5 | `claude-run` executable: flags + `--harness` + stdin prompt | cli `scripts/run.mts` (bin) | the `claude-infotics` bin, dispatching `claude-run` via the platform's `dispatchProjectedSurface` | **PROVEN** | drove real `claude` through the derived surface ("rebuild-complete"); no hand-rolled arg parser |
| 6 | Harness composition: MCP servers + hooks + context → `--mcp-config`/`--settings`/run options | cli `harness.mts` | `claude-harness-plan` op | **PROVEN** | composed mcp-config + hooks-settings + append-context; unit-tested |
| 7 | Read persisted `~/.claude/projects/<slug>/*.jsonl` sessions | cli `transcripts.mts` | reused platform ops (`claude-session-status`/`-suit`/`-admit`) | **PROVEN** | read a real session transcript end-to-end. **Requires `--data-root <project>`**: `defaultFilesystemBinding` derives `claudeSessionRoot` from the data-root slug, so pointing it at this package (the default) finds no sessions and silently returns `null`. |
| 8 | Read live `.mcp.json` + `.claude/settings.json`; merge-apply | organizing-with-claude `harness.readHarness/applyMcpConfig` | `claude-harness-read` + `claude-harness-apply` ops | **PROVEN** | read this repo's real substrate (server `metroplat`; 4 hook events); merged a server + hook into a temp project without clobbering the existing one |
| 9 | Anthropic Messages API inference | organizing-with-claude `inference.claudeInfer` (holography) | MetroPlat `anthropicMessagesInferenceSource` + `messages.complete` | SUPERSEDED | provider-neutral witnessed source; needs `ANTHROPIC_API_KEY` to run |
| 10 | Richer transcript reading (work-claims, fleet, token-usage) | *(partial in archive)* | MetroPlat `transcripts/*` re-export | SUPERSEDED | present when MetroPlat submodule built |
| 11 | MCP **hub server** (harness tools reachable from a Claude Code session over MCP) | llm-claude-harness `service.mts` (2 tools) | `src/mcp.mts` + `claude-infotics-mcp` bin | **PROVEN (BEATS)** | real stdio JSON-RPC session: `initialize` → serverInfo; `tools/list` → **all 15** operations (vs the original's 2); `tools/call claude-harness-read` → this repo's real substrate as structured content. `tools/call` delegates to `dispatchProjectedSurface`, so MCP inherits the CLI's identical capability authorization + journal witness. |
| 12 | Project a run → work items + reports + cost events | cli `events.mts` (792 lines, `@emsenn/relating`) | `claude-project-run` op (+ reused `agentTokenUsageOperations`) | **PROVEN** | projected a REAL 1775-line session transcript → **437 work items** (418 ok / 19 errored), each settled by its paired `tool_result`; folded a real run's usage + cost; `--write` journals both as EAVT rows. Reading is by `--session`/`--file` (host read) because the platform caps boundary strings at 256KB. |
| 13a | Harness **fact model** (agent/model/mcp-servers+points-at/skills/commands/subagents/hooks/settings as subject–predicate–object facts) | organizing-with-claude `claude/code/cli-harness/*-topology.mts` | `claude-harness-read` → resolved slots + `facts[]`, same predicate vocabulary | **PROVEN** | Determined by READING the topology (I had twice judged it without doing so). It was genuinely lost: the old `claude-harness-read` modelled 2 of 8 slots. Now models all 8 off the real substrate — this repo yields **53 facts**: 25 skills, 8 subagents, 4 hooks, 13 settings, 1 mcp-server + its `points-at` edge (resolved to the real endpoint/command, generalizing off the retired `operations-manifold` constant). |
| 13b | Topological **settlement** of those facts (`settleUtterances`, `fixedPointReadings`) | same, via `@emsenn/relating` meme-topology | *(not carried — recommend not carrying HERE)* | **DECISION NEEDED** | Evidence, not an excuse: `settleUtterances`/`fixedPointReadings`/`induce*Topology` are referenced ONLY inside the topology modules themselves — **the archive never called them**; `renderHarness` printed `utterances.length`, not the settlement. Rebuilding it means porting `@emsenn/relating`'s meme-topology fixed-point math, which is a MATH-LAYER capability (Obsmetrologia/MetroPlat), not a Claude toolkit's. Recommendation: claude-infotics emits the facts (13a, done); if the firm wants fixed-point settlement over fact-sets, it belongs in the math layer and consumes these facts. Operator's call. |
| 14 | VS Code cockpit specialization | organizing-with-claude-code-in-vs-code | *(not carried)* | **OWED** | "out of scope" was a dodge. It is a separate product surface (a VS Code extension), not something the CLI subsumes; MetroPlat's `integrations/vscode` is a substrate, not the cockpit. Either build it or retire it by decision — not by silence. |
| 15a | Session computer: `capsule` | cli `session/session.mts` | `claude-capsule` op | **PROVEN** | sliced real package files, confined + hashed |
| 15b | Session computer: `finding` (append-only, charge-bearing) | cli `session/session.mts` + retired `@emsenn/relating` charges | `claude-finding` op → journal EAVT row (`openJournal().appendRows`) | **PROVEN** | wrote 2 real findings to the journal |
| 15c | Session computer: `recall` (by subject) | cli `session/session.mts` | `claude-recall` op → `journal.scanCausalTerritory` fold | **PROVEN** | recalled both findings by subject, in causal order |
| 15d | Session computer: `impact` (changed → dependents) | cli `session/session.mts` + `@emsenn/computing/git` | `claude-impact` op → `readGitWorkspaceChange` + `readModuleTopology.importedBy` | **PROVEN** | found the real changed modules + their true reverse-dependency closure |
| 15e | Session computer: `suggested commands` | cli `session/session.mts` | `claude-impact` → `suggestedCommands` | **PROVEN (BEATS)** | derived from the affected packages' real manifests, not guessed: suggested `check`+`test` and correctly withheld `build`, which this package does not declare |

\* #12: if any live tool consumes the relational findings/work carriers, that
consumer must be identified before deleting `events.mts`. I found none in the
live tree, but I did not exhaustively prove absence.

## Deletion verdict

**Standing rule (operator, this session): a capability with no consumer still
gets implemented.** "Nothing uses it" is not a reason to drop it — if we delete
code carrying capability X and claude-infotics lacks X, X is *lost*. Deletion is
earned only when nothing is lost. Several rows above were previously marked DEAD
on exactly that excuse and have been corrected to **OWED**.

**Deletion is NOT yet earned.** Outstanding:

- **#3 live output** — REGRESSION. The rebuild traded away streaming entirely.
  This is the one place the platform architecture cost a real capability.
- **#13b settlement math** — DECISION: rebuild `@emsenn/relating`'s meme-topology
  fixed-point settlement in the math layer, or retire it? (The archive itself
  never called it.) The fact model it settled over is now built (#13a).
- **#14 VS Code cockpit** — OWED, or retired by explicit decision.

**Ready now** (nothing lost): the `claude` binary driver (#1–6), transcript
reading (#7, with `--data-root`), live harness read/apply (#8), messages (#9,
unexercised — no API key), and the entire session computer (#15a–e, each proven
against reality).

Two standing caveats: `claude-complete` (#9) has never been run (no
`ANTHROPIC_API_KEY`); and for #12, no live consumer of the retired relational
carriers was found, but absence was not exhaustively proven — which, per the
rule above, does not license dropping the capability anyway.

## How to run the evidence

```
pnpm test          # 16 unit tests (cli, harness, transcripts)
pnpm check         # tsc --noEmit, clean
# real drives (need `claude` on PATH):
node src/bin/claude-run.mts --model claude-haiku-4-5-20251001 --output-format json --prompt "hi"
```
