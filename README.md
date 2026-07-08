# Codex plugin for Antigravity

Use **OpenAI Codex** from inside **Google Antigravity** for code review and task delegation — without leaving the agent you already work with.

Same idea as [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (which brings Codex into Claude Code), ported to a different host: here the host is **Antigravity** (the IDE / 2.0 app / `agy` CLI) and it shells out to your local `codex` CLI.

## How it works in Antigravity

Per the [official plugin docs](https://antigravity.google/docs/plugins), an Antigravity plugin bundles **skills, rules, MCP servers, and hooks** — it does **not** provide custom slash commands or subagents. So the interface in Antigravity is a **skill**:

> Just tell the agent, in natural language: **“review these changes with Codex”**, **“ask Codex to fix the failing test”**, **“get a second opinion from Codex on this design.”**

The `codex` skill activates, and the Antigravity agent runs the bundled Node runner in the terminal, which drives `codex exec`. Codex's output comes back verbatim.

> The repo also ships Claude-Code-style `commands/` and an `agents/` subagent. Antigravity ignores those, but they let the **`agy` CLI** and **Claude Code** use the same bundle with real `/codex:*` slash commands. In the Antigravity IDE/2.0 app, use natural language instead.

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

Copy the `codex` plugin folder into a plugin location, then reload/restart Antigravity. **The path depends on which surface you use** — they are not the same:

| Surface | Scope | Plugin directory | Status |
|---|---|---|---|
| **Antigravity 2.0 app / IDE** | Global (all workspaces) | `~/.gemini/config/plugins/codex/` | ✅ official + verified working |
| **`agy` CLI** | Global (all workspaces) | `~/.gemini/antigravity-cli/plugins/codex/` | ⚠️ inferred from the CLI's config base (`~/.gemini/antigravity-cli/`); verify with `/skills` |
| Any surface | Per-workspace | `<workspace>/.agents/plugins/codex/` (or `_agents/plugins/`) | ✅ official |

The app/IDE and the `agy` CLI keep their configuration under **different base directories** — `~/.gemini/config/` for the app, `~/.gemini/antigravity-cli/` for the CLI — so their global plugin paths differ. The per-workspace `.agents/plugins/` path is shared by all surfaces.

**Antigravity 2.0 app / IDE (global):**
```bash
mkdir -p ~/.gemini/config/plugins
cp -r plugins/codex ~/.gemini/config/plugins/codex
```

**`agy` CLI (global):**
```bash
mkdir -p ~/.gemini/antigravity-cli/plugins
cp -r plugins/codex ~/.gemini/antigravity-cli/plugins/codex
```

**Per-workspace (any surface):**
```bash
mkdir -p .agents/plugins
cp -r plugins/codex .agents/plugins/codex
```

Then restart Antigravity, confirm the skill loaded with `/skills` (you should see `codex`), and run the setup check by asking: **“check if Codex is set up.”** If Codex is installed but not logged in, run `codex login` in a terminal.

> If `/skills` doesn't show `codex` after a global install, fall back to the per-workspace `.agents/plugins/codex/` path — that one is confirmed for every surface.

## Using it from the `agy` CLI or Claude Code (optional)

Because the bundle also carries `commands/` and an `agents/codex-rescue` subagent, in those hosts you additionally get real slash commands:

```
/codex:setup
/codex:review [--base <ref>] [--background]
/codex:adversarial-review [--base <ref>] [focus …]
/codex:rescue [--write] [--background] <what codex should do>
/codex:status | /codex:result | /codex:cancel
```

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
