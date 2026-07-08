---
description: Check whether the local Codex CLI is installed and authenticated for use from Antigravity
argument-hint: '[--json]'
allowed-tools: Bash, AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" setup $ARGUMENTS
```

Present the setup output to the user as-is.

If the output says Codex is **not installed**:
- Tell the user to install it: `npm install -g @openai/codex` (requires Node.js 18.18+).
- If a package manager is available and the user agrees, you may run that install and rerun setup.

If Codex is installed but **not authenticated**:
- Tell the user to run `codex login` in a terminal (ChatGPT sign-in or an OpenAI API key), then rerun `/codex:setup`.

Do not attempt to review code or delegate tasks until setup reports **Ready: ✅**.
