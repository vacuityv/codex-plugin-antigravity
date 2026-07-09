# Codex plugin for Antigravity

Use **OpenAI Codex** from inside **Google Antigravity** for code review and task delegation — without leaving the agent you already work with.

Same idea as [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (which brings Codex into Claude Code), ported to a different host: here the host is **Antigravity** (the IDE / 2.0 app / `agy` CLI) and it shells out to your local `codex` CLI.

## How it works in Antigravity

The interface is a **skill**. Whichever surface you use, you drive it in natural language:

> **“review these changes with Codex”**, **“ask Codex to fix the failing test”**, **“get a second opinion from Codex on this design.”**

The `codex` skill activates, and the Antigravity agent runs the bundled Node runner in the terminal, which drives `codex exec`. Codex's output comes back verbatim.

What each surface loads from the bundle (verified with `agy plugin validate`):

| Surface | skills | agents | commands |
|---|:--:|:--:|:--:|
| **`agy` CLI** | ✅ | ✅ | ✅ (converted to skills) |
| **Antigravity 2.0 app / IDE** | ✅ | ✅ | — |

So on the `agy` CLI you *additionally* get `/codex:*` slash commands (see below); in the 2.0 app / IDE you use natural language, which triggers the same `codex` skill. The same bundle also works in Claude Code.

## What you can ask for

| Say something like… | What runs |
|---|---|
| “Is Codex set up?” | `codex-runner setup` |
| “Review my changes with Codex” / “…against main” | `codex exec review [--base …]` (read-only) |
| “Adversarially review this design with Codex” | a design-challenge review |
| “Delegate this to Codex” / “ask Codex to fix X” | `codex exec` (read-only; `--write` to edit) |
| “How’s the Codex job?” / “show the result” / “cancel it” | background job `status` / `result` / `cancel` |

## Performance & background jobs

Codex is a real autonomous agent, so a non-trivial task (generating files, a refactor, anything with `--write`) legitimately takes **1–3 minutes** — that is Codex working, not the plugin hanging.

- The runner uses `codex exec` (non-interactive) with a `-s` sandbox, so **Codex never pauses for an approval prompt and never waits on stdin**. A foreground run that looks "stuck" is just Codex still thinking. You do **not** need `--dangerously-bypass-approvals-and-sandbox` (the plugin deliberately avoids it — `-s workspace-write` is the safer path and is enough to write files).
- **A foreground run blocks the terminal** until Codex finishes. That's fine for quick read-only questions.
- For **`--write` or long / multi-step work, use the background mode**: the runner returns a job ID immediately, then you check `status` and fetch `result`. In Antigravity, just say *"…in the background"* (e.g. "generate the dashboard with Codex in the background"), and the `codex` skill runs it detached and reports the job ID.

Background jobs are tracked on disk under `${CODEX_HOME:-~/.codex}/antigravity-plugin/jobs/`, so `status` / `result` / `cancel` keep working across separate calls and restarts.

## Requirements

- **OpenAI Codex CLI** — `npm install -g @openai/codex`
- A **ChatGPT subscription (incl. Free) or an OpenAI API key** — usage counts toward your Codex limits
- **Node.js 18.18+**
- **Google Antigravity** (IDE, 2.0 app, or the `agy` CLI)

## Install

First get the bundle:

```bash
git clone https://github.com/vacuityv/codex-plugin-antigravity.git
cd codex-plugin-antigravity
```

Then install it into whichever Antigravity surface you use.

### A. `agy` CLI — use the plugin manager (recommended)

```bash
agy plugin install ./plugins/codex
agy plugin list          # should show "codex" with components: skills, agents, commands
```

To update later: `git pull` in this repo, then re-run `agy plugin install ./plugins/codex`. To remove: `agy plugin uninstall codex`.

### B. Antigravity 2.0 app / IDE — copy into the global plugins folder

```bash
mkdir -p ~/.gemini/config/plugins
cp -r plugins/codex ~/.gemini/config/plugins/codex
```

Restart Antigravity, then run `/skills` — you should see **`codex`**. This makes it active in every workspace.

### C. Single workspace only — copy into the project

```bash
mkdir -p /path/to/your/project/.agents/plugins
cp -r plugins/codex /path/to/your/project/.agents/plugins/codex
```

### Then verify

In Antigravity, run `/skills` (you should see `codex`), then ask: **“check if Codex is set up.”** If Codex is installed but not logged in, run `codex login` in a terminal.

> Prefer a symlink so `git pull` updates the plugin in place (methods B/C):
> `ln -s "$(pwd)/plugins/codex" ~/.gemini/config/plugins/codex`

## Slash commands (`agy` CLI / Claude Code)

On the `agy` CLI and in Claude Code, the bundled `commands/` become real slash commands (the CLI converts them to skills on import):

```
/codex:setup
/codex:review [--base <ref>] [--background]
/codex:adversarial-review [--base <ref>] [focus …]
/codex:rescue [--write] [--background] <what codex should do>
/codex:status | /codex:result | /codex:cancel
```

In the Antigravity 2.0 app / IDE, use natural language instead (it triggers the same `codex` skill).

## Runtime design

Everything runs through one host-agnostic entrypoint, `scripts/codex-runner.mjs`, which shells out to `codex exec`:

- **review / adversarial-review** → `codex exec review [--uncommitted | --base <ref>]` (adversarial folds a design-challenge prompt + your focus into the review instructions). Always read-only.
- **task** → `codex exec [-s read-only|workspace-write] [resume --last] -o <file> "<prompt>"`; the final message is captured reliably via `-o`.
- **background jobs** → the runner detaches a child process, tracks it under `${CODEX_HOME:-~/.codex}/antigravity-plugin/jobs/`, and `status` / `result` / `cancel` read that store.

Because the runner only depends on the `codex` binary (not on any IDE internals), the same runtime works from Antigravity, the `agy` CLI, Claude Code, or a plain terminal.

## Environment variables

- `CODEX_BIN` — path to the codex binary, if it is not on `PATH`.
- `CODEX_HOME` — Codex home dir (defaults to `~/.codex`); also where background jobs are stored.

## Layout

```
.claude-plugin/marketplace.json        # marketplace entry (agy CLI / Claude Code)
plugins/codex/
  plugin.json                          # Antigravity plugin manifest
  .claude-plugin/plugin.json           # Claude-Code-compatible manifest
  skills/
    codex/SKILL.md                     # ← the interface in the Antigravity IDE/app
    codex-cli-runtime/SKILL.md         # internal runtime contract
    gpt-5-prompting/SKILL.md           # internal prompt-shaping guidance
  commands/                            # /codex:* slash commands (agy CLI / Claude Code only)
  agents/codex-rescue.md               # forwarding subagent (agy CLI / Claude Code only)
  scripts/
    codex-runner.mjs                   # the companion runtime
    lib/{codex,git,jobs}.mjs
```

## License

MIT — see [LICENSE](LICENSE).
