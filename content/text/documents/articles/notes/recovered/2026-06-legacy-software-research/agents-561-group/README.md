# agents.561.group

An OpenAI-compatible chat surface over the 561 Group character roster.
Users authorize with Google OAuth, pick a character to talk with, and each character keeps a **discrete, per-user memory** that it fuses with its own domain context on every turn.
The same OAuth authorization server lets a user connect their ChatGPT or Anthropic account to a character as an **MCP endpoint**.

## Shape

One process, one OAuth authorization server, one memory mount:

| Surface | Path | Gate |
| --- | --- | --- |
| OAuth transport + well-known metadata | `/oauth/*`, `/.well-known/*` | ungated (discovery) |
| Human WebUX (landing, sign-in, token) | `/`, `/ui/*` | ungated |
| OpenAI-compatible API | `/v1/models`, `/v1/chat/completions` | OAuth bearer |
| Per-character MCP endpoints | `/c/<id>/mcp` | OAuth bearer |

Every authenticated turn — over `/v1` or over MCP — routes through the same memory-fused engine, so a character holds **one** memory of each user no matter how that user reaches it.

## How it's built (reuse, not reinvention)

- **OAuth** is the ecosystem's `@emsenn/organizing-with-the-web/oauth-google` authorization server (Google IdP, dynamic client registration, RFC 8414/9728 metadata), generalized from single-operator confinement to **multi-user** admission (any verified Google account, or an `OAUTH_ALLOWED_EMAILS` allowlist).
  The verified email is each user's stable identity.
- **Inference + memory** is `@emsenn/organizing-with-openai-agents`: the `pulse` (chat → log → derive → judge → dream) writes memory; the new `recallMemory` reads it back so a stateless web turn can fuse it into the system prompt.
- **Characters** are data (`src/characters.mts`, overridable via `characters.config.json`): an id (the OpenAI model id and MCP path segment), a name, a description, and a `domain` — the standing system prompt.
- **HTTP + MCP** is `@emsenn/http-server` (`createMcpApp`, App composition).

## Connecting

**OpenAI-compatible client** (e.g. `openai-agent-tui`): sign in at `/`, copy the token, set `base URL = <site>/v1`, `API key = <token>`, `model = <character id>`.

**ChatGPT / Claude**: add `<site>/c/<character id>/mcp` as an MCP connector; the client runs the OAuth sign-in itself, then calls the character's `talk` tool.

## Environment

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google OAuth credentials.
- `PUBLIC_BASE_URL` — the externally-visible base URL (behind the reverse proxy).
- `OAUTH_ALLOWED_EMAILS` — optional comma-separated allowlist; unset = open.
- `NVIDIA_API_KEY` / `GROQ_API_KEY` / … — at least one inference endpoint key.
- `PORT` (default 18820), `HOST` (default 127.0.0.1).

## Run

```sh
pnpm --filter @emsenn/agents run check   # typecheck
pnpm --filter @emsenn/agents run serve   # start
```
