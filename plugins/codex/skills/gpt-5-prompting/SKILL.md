---
name: gpt-5-prompting
description: Internal guidance for shaping a sharp prompt to forward to OpenAI Codex (GPT-5-class coding models) for a task, review, or diagnosis. Use only to tighten the forwarded prompt — never to do the work yourself.
---

# Shaping a Codex prompt

Codex (GPT-5-class) does best with a **specific, bounded, verifiable** request.
Use this only to rewrite the caller's ask into a tighter prompt before
forwarding — do not investigate the repo or draft the solution yourself.

## Shape a good task prompt

- **State the goal, not the steps.** Describe the desired end state and the
  acceptance check ("tests pass", "endpoint returns 200"), and let Codex plan.
- **Name the target.** Point at the file, module, symbol, or failing command
  when the caller mentioned it — Codex explores from there.
- **Carry the constraints.** Preserve any "don't touch X", "keep the public API",
  "no new deps", performance, or style constraints the caller stated.
- **Include the reproduction.** For a bug, forward the exact error text or the
  command that reproduces it, verbatim. Do not paraphrase stack traces.
- **Set the mode.** If the caller wants edits applied, that maps to `--write`;
  if they want analysis only, keep it read-only and say "diagnose, do not edit".

## Keep out

- Do not add speculative requirements the caller did not ask for.
- Do not expand scope ("also refactor…") unless the caller did.
- Do not inline your own solution or a step-by-step plan — Codex reasons better
  from the problem than from a half-formed answer.
- Do not strip the caller's domain detail to make it shorter; specificity helps.

## Reviews

For `review` / `adversarial-review` you normally forward as-is — the runner
supplies the review framing. Only tighten a caller-supplied focus string so it
names the concrete risk area ("challenge the retry/backoff design", "is the
migration reversible?") rather than a vague "look for problems".
