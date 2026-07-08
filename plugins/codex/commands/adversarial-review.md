---
description: Run a steerable Codex review that challenges the implementation approach and design
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [focus ...]'
allowed-tools: Bash
---

Run an **adversarial** Codex review that questions the chosen design — not just a stricter pass over implementation defects.

Raw slash-command arguments: `$ARGUMENTS`

Core constraint:
- This command is **review-only**. Do not fix issues, apply patches, or offer to make changes.
- Keep the framing on whether the current approach is the right one, what assumptions it depends on, and where the design could fail under real-world conditions (auth, data loss, rollback, races, reliability, scale).
- Return Codex's output verbatim.

Execution:
- Uses the same review-target selection as `/codex:review` (working tree by default, `--base <ref>` for a branch diff).
- Unlike `/codex:review`, any free text after the flags is passed through as extra focus for the challenge.
- `--background` detaches the run; otherwise it blocks in the foreground.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" adversarial-review "$ARGUMENTS"
```

Return the command stdout verbatim — do not weaken the framing, summarize, or act on the findings.

If it was started in the background, point the user to `/codex:status` and `/codex:result`.
