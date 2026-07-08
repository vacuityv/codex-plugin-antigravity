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

Long runs go to the background and are tracked on disk, so you can check `status` / `result` later.

## Requirements

- **OpenAI Codex CLI** — `npm install -g @openai/codex`
- A **ChatGPT subscription (incl. Free) or an OpenAI API key** — usage counts toward your Codex limits
- **Node.js 18.18+**
- **Google Antigravity** (IDE, 2.0 app, or the `agy` CLI)

## Install

Copy the `codex` plugin folder into one of Antigravity's plugin locations, then reload/restart Antigravity.

**Global — active in every workspace** (recommended):

```bash
mkdir -p ~/.gemini/config/plugins
cp -r plugins/codex ~/.gemini/config/plugins/codex
```

**Per-workspace — only in that project** (`.agents/` or `_agents/` at the workspace root):

```bash
mkdir -p .agents/plugins
cp -r plugins/codex .agents/plugins/codex
```

Then in Antigravity, confirm the skill loaded with `/skills` (you should see `codex`), and run the setup check by asking: **“check if Codex is set up.”** If Codex is installed but not logged in, run `codex login` in a terminal.

> The `~/.gemini/antigravity-cli/plugins/` path some third-party guides mention only applies to the **`agy` CLI** after you install and run it — it is not where the IDE/app looks. The IDE/app use `~/.gemini/config/plugins/` (global) and `.agents/plugins/` (workspace).

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
