# @emsenn/claude-infotics

Red Cup Engineering's Claude capability, as an **application ON the
[MetroPlat](../../../../../../src/apps/metroplat) platform** — not a standalone
toolkit. Its Claude capabilities are authored as MetroPlat `Operation`s and
composed with the platform operations it reuses; the platform **derives** the
CLI, HTTP, and MCP faces from that one catalog. There is no hand-rolled `spawn`,
arg parser, or bin.

## Operations

Authored here (claude-specific, no platform home):

| Verb | Does | On platform |
| --- | --- | --- |
| `claude-run` | Drive the `claude` binary in print mode; fold the run into a summary | `integrations/process` `runProcessCommand` |
| `claude-complete` | One Anthropic Messages completion | `integrations/anthropic` `anthropicMessagesInferenceSource` (needs `ANTHROPIC_API_KEY`) |
| `claude-harness-plan` | Compose MCP servers + hooks + context into run options | pure |
| `claude-capsule` | Slice files into a reusable context capsule | host filesystem read |
| `claude-finding` | Record a durable finding (append-only) | `journal` — one EAVT row |
| `claude-recall` | Recall a subject's findings | `journal.scanCausalTerritory` |
| `claude-impact` | Changed files → reverse-dependents → commands (from real manifests) | `integrations/git` + `monitoring` `readModuleTopology` |
| `claude-harness-read` | Model a project's whole harness — servers (+points-at), skills, commands, subagents, hooks, settings — as slots + facts | host filesystem read |
| `claude-harness-apply` | Merge servers/hooks/permissions in, never clobbering (dry-run by default) | host filesystem write |
| `claude-project-run` | A run/transcript → work items + token usage + cost | folds events; `--write` journals EAVT rows |

Reused straight from the platform (genuinely downstream — zero re-implementation):
`claude-session-status` / `claude-session-suit` / `claude-session-admit`
(transcript reading), `claude-fleet` / `fleet-admit`, and
`workspace-change-readout` (git change — the #15 impact change-half).

## Run

No build — `.mts` runs directly on Node ≥ 22.18. Requires the MetroPlat
submodule to be **built** (`pnpm run build` there); the app consumes its exported
subpaths.

```sh
# the platform derives this CLI from the catalog:
echo '{}' | node src/scripts/claude-infotics.mts --help
echo '{}' | node src/scripts/claude-infotics.mts claude-run --prompt "hi" --model claude-haiku-4-5-20251001 --output-format json
echo '{"packages":["."]}' | node src/scripts/claude-infotics.mts claude-capsule

# reading a project's Claude transcripts needs --data-root pointed AT that project:
echo '{"id":"<session-uuid>"}' | node src/scripts/claude-infotics.mts claude-session-status --data-root /home/emsenn/info
```

### As an MCP server

`claude-infotics-mcp` serves every operation as an MCP tool over stdio, so a
Claude Code session can reach them. Tool calls route through the same governed
dispatcher as the CLI (same capability authorization, same journal witness).

```json
{ "mcpServers": { "claude-infotics": { "type": "stdio", "command": "node",
    "args": ["<abs>/src/scripts/claude-infotics-mcp.mts", "--data-root", "<project>"] } } }
```

**`--data-root` is load-bearing** (or `CLAUDE_INFOTICS_DATA_ROOT`).
`defaultFilesystemBinding` derives `claudeSessionRoot` from it as
`~/.claude/projects/<data-root-with-separators-as-dashes>`. Point it at the
project whose sessions you want; left at the default (this package) the
transcript operations find nothing and return `null`.

Operations are capability-secured: the CLI runs under a `claude-infotics#*` grant
to the local-operator subject (`src/authorization.mts`) — the platform's own
object-capability model, the same way `infograph` is granted to subject `claude`.

- `pnpm check` — tsc, clean.
- `pnpm test` — operation-logic unit tests (no network).

Coverage vs. the decommissioned prior claude-harness packages is audited in
[CAPABILITIES.md](CAPABILITIES.md).
