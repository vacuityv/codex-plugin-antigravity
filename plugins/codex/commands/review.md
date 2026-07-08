---
description: Run a read-only Codex code review of your local git changes
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]'
allowed-tools: Bash
---

Run a Codex review of the current work and return Codex's output verbatim.

Raw slash-command arguments: `$ARGUMENTS`

Core constraint:
- This command is **review-only**. Do not fix issues, apply patches, or offer to make changes.
- Your only job is to run the review and return Codex's output exactly as-is.

Execution:
- The runner detects the review target (working-tree changes by default, or a branch diff with `--base <ref>`), guards against empty diffs, and runs `codex exec review`.
- If the arguments include `--background`, the runner detaches the run and returns a job ID immediately.
- Otherwise the review runs in the foreground and blocks until Codex finishes.
- Pass the user's arguments through unchanged.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" review "$ARGUMENTS"
```

Return the command stdout verbatim — do not paraphrase, summarize, or add commentary, and do not act on the findings.

If it was started in the background, tell the user to check `/codex:status` for progress and `/codex:result` for the review.
