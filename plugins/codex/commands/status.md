---
description: Show active and recent background Codex jobs for this repository
argument-hint: '[job-id] [--all]'
allowed-tools: Bash
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" status "$ARGUMENTS"
```

If the user passed no job ID, render the output as a compact Markdown table (job ID, kind, status, phase, elapsed, summary). If the user passed a job ID, present the full detail output as-is. Do not add commentary beyond the table/detail.
