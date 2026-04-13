# AGENTS.md — Conventions for AI Coding Agents

## Files That Must Never Be Committed

- `.env` — contains ANTHROPIC_API_KEY
- `*_PROJECT_CONTEXT.md` — contains private project context
- `agent-identity*.json` — contains Ed25519 private keys
- `logs/` — campaign trace artifacts (large, ephemeral)

## Project Rules

- Read the build plan (`epistemic-poisoning-build-plan-v3-FINAL.md`) before making changes
- Follow phase order exactly: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
- One change at a time. Verify after every change. Commit and push after every working change.
- Pin all dependencies to exact versions (no `^` or `~`)
- Use Anthropic Tool Use (function calling) for all structured LLM output
- Temperature 0 on all target agent calls
- Sequential API calls to Claude — no Promise.all() on LLM calls
- Never retry a signed POST to AgentGate by reusing headers
- Use Zod for all internal schemas
- Do NOT add verification-defense features in v0.1.0
- Do NOT implement cumulative poisoning across rounds
- Do NOT connect to remote AgentGate — local only (http://127.0.0.1:3000)
- Do NOT modify AgentGate core
