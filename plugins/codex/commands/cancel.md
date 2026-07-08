---
description: Cancel an active background Codex job in this repository
argument-hint: '[job-id]'
allowed-tools: Bash
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" cancel "$ARGUMENTS"
```

Present the command output verbatim. With no job ID, the runner cancels the most recent active job in this repository.
