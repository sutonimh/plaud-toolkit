# plaud

> **Alpha** — Early test version. Building in public, testing on my own recordings.

> **This fork** adds [`packages/plaud-mcp`](packages/plaud-mcp), a standalone read-only MCP server
> with more accurate transcript/summary extraction than `@plaud/mcp` above (see that package's
> README for why). Everything else here is unchanged from
> [upstream](https://github.com/sergivalverde/plaud-toolkit).

Unofficial TypeScript toolkit for the [Plaud](https://www.plaud.ai/) API — core library, CLI, MCP server, and an Obsidian plugin.

## Why

[Plaud](https://www.plaud.ai/) makes AI-powered wearable recorders (Plaud Note, Plaud NotePin) that capture meetings, conversations, and voice notes, then transcribe and summarize them in the cloud. Great hardware, but all your data lives behind their app with no official API or export tools.

This toolkit gives you programmatic access to your own recordings. Download audio files, pull transcripts, sync everything to local folders — your data, your workflow. Built as a monorepo with four packages:

- **`@plaud/core`** — Shared library: authentication, API client, config management. Handles token lifecycle automatically, auto-refreshing when within 3 days of expiry — observed token lifetime is ~30 days, not the ~300 days originally documented here, so this fork tightened the refresh buffer accordingly (see `packages/core/src/auth.ts`). Requests run through a pluggable HTTP transport (Node `fetch` by default; the Obsidian plugin injects `requestUrl` to bypass renderer CORS).
- **`@plaud/cli`** — Command-line tool to list, download, transcribe, and sync recordings.
- **`@plaud/mcp`** — [MCP server](https://modelcontextprotocol.io/) that exposes your Plaud recordings to AI assistants like Claude, making your voice notes searchable and accessible from any MCP-compatible tool.
- **`@plaud/obsidian`** — Obsidian plugin ("Plaud Pin Sync") that syncs recordings into your vault as Markdown notes, downloads the audio, and transcribes locally with [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper).
- **[`plaud-mcp`](packages/plaud-mcp)** *(this fork only)* — a second, independent MCP server with more accurate transcript/summary extraction; see its own README.

## Setup

```bash
git clone https://github.com/sergivalverde/plaud-toolkit.git
cd plaud-toolkit && npm install
```

### 1. Login

```bash
npx tsx packages/cli/bin/plaud.ts login
```

Enter your email, password, and region (us/eu). Credentials are stored locally in `~/.plaud/config.json` (mode 0600).

> **Note:** If you use Google Sign-In on Plaud, first set a password via "Forgot Password" on [web.plaud.ai](https://web.plaud.ai).

### 2. CLI Usage

```bash
# List recordings
npx tsx packages/cli/bin/plaud.ts list

# Get transcript
npx tsx packages/cli/bin/plaud.ts transcript <recording-id>

# Download audio
npx tsx packages/cli/bin/plaud.ts download <recording-id> ./audio/

# Sync all recordings to a folder
npx tsx packages/cli/bin/plaud.ts sync ./plaud-notes/
```

### 3. MCP Server

Add to your Claude config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "plaud": {
      "command": "npx",
      "args": ["tsx", "/path/to/plaud-toolkit/packages/mcp/src/index.ts"]
    }
  }
}
```

Tools available:
- `plaud_list_recordings` — list all recordings
- `plaud_get_transcript` — get transcript by recording ID
- `plaud_get_recording_detail` — full recording metadata
- `plaud_user_info` — account info
- `plaud_get_mp3_url` — temporary MP3 download URL

### 4. Obsidian Plugin

The `@plaud/obsidian` package is an Obsidian plugin ("Plaud Pin Sync") that pulls new recordings into your vault on a schedule. For each recording it downloads the audio, transcribes it (using Plaud's server transcript when available, otherwise locally via [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper)), and writes a Markdown note with frontmatter, transcript, and timestamps.

**Requirements:** macOS on Apple Silicon, and `mlx_whisper` installed for local transcription:

```bash
python3 -m venv ~/.mlx-whisper-venv
~/.mlx-whisper-venv/bin/pip install mlx-whisper
```

**Install into a vault** (builds the plugin and symlinks it in):

```bash
npm run build:plugin
./scripts/install-plugin.sh /path/to/your/vault
```

Then enable **Plaud Pin Sync** in Obsidian's community-plugins settings. Because it shares `@plaud/core`, the plugin uses the same credentials from `~/.plaud/config.json` — run `plaud login` first.

Configure region, the `mlx_whisper` path, model, sync interval, and the audio/notes folders in the plugin's settings tab. Defaults: notes in `Plaud/Notes`, audio in `Plaud/Audio`, sync every 60 minutes. Manual commands are also available from the command palette ("Sync Plaud recordings", "Retranscribe pending recordings").

> Updating the plugin later: `git pull && npm run build:plugin` — the symlink picks up the new build; just reload the plugin (or Obsidian).

## Token Management

Tokens are obtained automatically via email+password. Observed lifetime is ~30 days (not the ~300
days originally claimed here — see `packages/core/src/auth.ts`). The library refreshes silently
when a token is within 3 days of expiry. No manual intervention needed after initial `plaud login`.

## API

The API was reverse-engineered from the Plaud web app. This is an unofficial project — not affiliated with or endorsed by Plaud.

## License

MIT
