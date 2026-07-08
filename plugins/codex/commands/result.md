---
description: Show the stored final output for a finished background Codex job
argument-hint: '[job-id]'
allowed-tools: Bash
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" result "$ARGUMENTS"
```

Present the full command output to the user verbatim. Do not summarize or condense it — preserve the job ID, status, the complete result payload, file paths, and line numbers exactly as reported. With no job ID, the runner shows the most recently finished job.
