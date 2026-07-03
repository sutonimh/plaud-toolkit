# plaud-mcp

A local, read-only [MCP](https://modelcontextprotocol.io/) server that exposes your own Plaud
recordings (transcripts, AI summaries, metadata) to Claude Code and Claude Desktop.

Built against the unofficial Plaud API reverse-engineered by
[plaud-toolkit](https://github.com/sergivalverde/plaud-toolkit) (this repo is a fork of it — auth
and config come from its `@plaud/core` package). `plaud-mcp` adds its own read-only client on top,
because the upstream client's transcript extraction picks "whichever pre-fetched content string is
longest," which silently returns the AI summary mislabeled as the transcript for real recordings.
This package instead reads Plaud's `content_list` by content type (`transaction_polish` for the
transcript, `auto_sum_note` for the summary), which is accurate regardless of recording length.

Nothing in this package can create, modify, or delete anything in your Plaud account — every tool
is a read.

## Tools

| Tool | Description |
|---|---|
| `list_recordings` | List recordings (id, title, date, duration). Optional `limit`, `date_from`, `date_to` (ISO 8601), `query` (title substring match). |
| `get_recording` | Full metadata for one recording by id. |
| `get_transcript` | Speaker-labeled transcript text (`[Speaker 1] ...`) for one recording. |
| `get_summary` | Plaud's AI-generated summary/notes for one recording. |

Audio download and any write actions are intentionally out of scope.

## Setup

### 1. Install dependencies

From the repo root:

```bash
npm install
```

### 2. Log in

Credentials are shared with the rest of this fork via `~/.plaud/config.json`. Log in once using
the CLI package (this repo doesn't duplicate the login flow):

```bash
npx tsx packages/cli/bin/plaud.ts login
```

You'll be prompted for email, password, and region (`us` or `eu`).

> **Signed in with Google on Plaud?** The API only accepts email+password, not SSO. Set a password
> first via "Forgot Password" on [web.plaud.ai](https://web.plaud.ai) using the same email — this
> doesn't affect your existing Google sign-in, it just adds a password credential for API access.
> If the reset page says "Account not found" even with the correct email, that account may not
> support self-service password reset yet; contact Plaud support and ask them to enable it.

This writes `~/.plaud/config.json` with mode `0600`:

```json
{
  "credentials": {
    "email": "you@example.com",
    "password": "...",
    "region": "us"
  },
  "token": {
    "accessToken": "...",
    "tokenType": "Bearer",
    "issuedAt": 1783036362000,
    "expiresAt": 1785628362000
  }
}
```

`credentials` is read from disk; never hardcode secrets or pass them as arguments. Tokens are
refreshed automatically — observed lifetime is ~30 days (not the ~300 days some docs describe), and
this package's fork of `@plaud/core` refreshes proactively within 3 days of expiry so a cached
token is actually reused instead of re-authenticating on every call.

### 3. Smoke-test (optional but recommended)

```bash
npm run smoke -w plaud-mcp
```

Confirms credentials, token lifecycle, and a real API call, and prints your account info.

### 4. Register the server

**Claude Code** — add to `~/.claude.json` (user scope) or `.mcp.json` in a project:

```json
{
  "mcpServers": {
    "plaud": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/plaud-connector/packages/plaud-mcp/src/index.ts"]
    }
  }
}
```

Or via the CLI:

```bash
claude mcp add plaud -- npx tsx /absolute/path/to/plaud-connector/packages/plaud-mcp/src/index.ts
```

**Claude Desktop (macOS)** — add the same block to
`~/Library/Application Support/Claude/claude_desktop_config.json`, then restart Claude Desktop.

Replace `/absolute/path/to/plaud-connector` with the actual path to this repo on your machine.

## Error handling

The Plaud API mostly returns HTTP 200 with the real result encoded in a JSON `status` field
(`0` = success, `-1` = not found, `-302` = wrong region, other negative values = other errors), but
some auth failures come back as a real non-2xx HTTP status with a different `{ detail }` shape.
This client normalizes both into typed errors, which tools surface as a normal MCP error result
(`isError: true` with a readable message) rather than crashing the server:

- **Auth failure** (bad/rejected token) — clear error message from the API's `msg`/`detail` field.
- **Missing recording** — `get_transcript`/`get_summary`/`get_recording` on an unknown id return a
  "Recording not found" error; `list_recordings` never errors, just filters.
- **No transcript/summary yet** — returns a plain "No transcript/summary available for this
  recording" message rather than an error, since this is a normal state for a just-uploaded or very
  short recording.
- **Rate limiting** — HTTP 429 is mapped to a clear "rate limited, try again" error.
- **Region mismatch** — handled transparently; the client retries once against the correct region.

## Development

```bash
# Type-check
npx tsc --noEmit -p tsconfig.json

# Inspect tools interactively
npx @modelcontextprotocol/inspector npx tsx packages/plaud-mcp/src/index.ts
```

## License

MIT, consistent with the upstream [plaud-toolkit](https://github.com/sergivalverde/plaud-toolkit)
this fork is based on.
