# Codex plugin for Antigravity

Use **OpenAI Codex** from inside **Google Antigravity** (the `agy` CLI / Gemini agent) for code reviews or to delegate coding tasks — without leaving the workflow you already have.

This is the mirror image of [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (which brings Codex *into Claude Code*): here the host is **Antigravity** and it shells out to the local `codex` CLI.

## What you get

- `/codex:review` — a read-only Codex review of your current changes
- `/codex:adversarial-review` — a steerable review that challenges the design, not just the code
- `/codex:rescue` — delegate a coding / debugging / investigation task to Codex
- `/codex:setup` — check Codex is installed and authenticated
- `/codex:status`, `/codex:result`, `/codex:cancel` — manage background Codex jobs

Long runs can be detached with `--background`; the job survives on disk and is tracked across commands.

## Requirements

- **OpenAI Codex CLI** — `npm install -g @openai/codex`
- A **ChatGPT subscription (incl. Free) or an OpenAI API key** — usage counts toward your Codex limits
- **Node.js 18.18+**
- **Google Antigravity** with the `agy` CLI

## Install

The plugin ships in the Claude-Code-compatible plugin layout, which Antigravity's plugin loader also understands.

**Option A — drop into Antigravity's plugin directory**

Copy the plugin so Antigravity discovers it on startup:

```bash
# user-global
cp -r plugins/codex ~/.gemini/antigravity-cli/plugins/codex

# …or per-workspace (at the root of the project you open in Antigravity)
mkdir -p .agents/plugins && cp -r plugins/codex .agents/plugins/codex
```

Restart `agy` (or reload plugins). Verify with `/skills`, `/agents`, and the `/codex:*` slash commands.

**Option B — add as a marketplace**

If your Antigravity build supports Claude-Code plugin marketplaces, point it at this repo's `.claude-plugin/marketplace.json` and install the `codex` plugin from the `codex-antigravity` marketplace.

Then run:

```
/codex:setup
```

It tells you whether Codex is ready. If Codex is installed but not logged in, run `codex login` in a terminal and rerun setup.

## Usage

```
/codex:review                       # review uncommitted working-tree changes
/codex:review --base main           # review this branch against main
/codex:review --background          # detach; then /codex:status, /codex:result

/codex:adversarial-review --base main challenge the caching + retry design

/codex:rescue fix the failing test in tests/auth.test.js
/codex:rescue --write refactor the config loader to support env overrides
/codex:rescue --background --write add integration tests for the payments module

/codex:status                       # table of jobs in this repo
/codex:result <job-id>              # stored final output
/codex:cancel <job-id>
```

Reviews are always **read-only**. `/codex:rescue` is read-only (diagnosis / research) unless you add `--write`, which lets Codex edit files (`workspace-write` sandbox).

## How it works

Everything runs through one host-agnostic Node entrypoint, `scripts/codex-runner.mjs`, which shells out to `codex exec`:

- **review / adversarial-review** → `codex exec review [--uncommitted | --base <ref>]` (adversarial folds a design-challenge prompt + your focus text into the review instructions).
- **task** → `codex exec [-s read-only|workspace-write] [resume --last] -o <file> "<prompt>"`; the final message is captured reliably via `-o`.
- **background jobs** → the runner detaches a child process, tracks it under `${CODEX_HOME:-~/.codex}/antigravity-plugin/jobs/`, and `status` / `result` / `cancel` read that store.

Because the runner only depends on the `codex` binary (not on any IDE internals), the same runtime works from Antigravity, Claude Code, or a plain terminal.

## Environment variables

- `CODEX_BIN` — path to the codex binary, if it is not on `PATH`.
- `CODEX_HOME` — Codex home dir (defaults to `~/.codex`); also where background jobs are stored.
- `CLAUDE_PLUGIN_ROOT` — the plugin's install dir, provided by the host; used by the slash commands to locate the runner.

## Layout

```
.claude-plugin/marketplace.json        # marketplace entry (Option B)
plugins/codex/
  plugin.json                          # Antigravity-native plugin marker
  .claude-plugin/plugin.json           # Claude-Code-compatible marker
  commands/                            # /codex:* slash commands
  agents/codex-rescue.md               # the forwarding subagent
  skills/                              # runtime + prompting guidance
  scripts/
    codex-runner.mjs                   # the companion runtime
    lib/{codex,git,jobs}.mjs
```

## License

MIT — see [LICENSE](LICENSE).
