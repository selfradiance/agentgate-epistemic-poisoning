# Epistemic Poisoning Simulator

> **Status: Design-stage project.** Public for concept review, not yet implemented.

A two-agent adversarial simulation that tests whether AgentGate's bond-and-slash model can govern knowledge integrity — not just action integrity. A saboteur agent subtly corrupts shared knowledge to cause a target agent to make catastrophic decisions.

## Why This Exists

RAG-heavy architectures are the industry default. Agents read from shared knowledge bases — documents, logs, environment variables, retrieved context — and make decisions based on what they find. But nobody is stress-testing the knowledge supply chain. What happens when the data itself is poisoned?

The MCP Firewall governs tool calls. This project asks the next question: what about the data those tools return?

## The Core Question

If a saboteur agent subtly corrupts shared knowledge, and a target agent makes a catastrophic decision because of that corruption — who gets slashed? The saboteur (for corrupting)? The target (for not verifying)? Both? And can AgentGate's existing model even detect it?

## Design Concepts

- **Saboteur agent** writes subtly corrupted information into a shared knowledge base, bonded per write
- **Target agent** reads the knowledge base and makes consequential decisions
- **Corruption must be subtle** — a human or agent skimming the knowledge base shouldn't immediately notice
- **Measurement:** poisoning effectiveness, detection rate, bond model effectiveness, subtlety spectrum
- **Key conceptual contribution:** extending AgentGate from action bonds to information bonds — "I bond that what I'm writing is accurate"

## How It Relates to AgentGate

[AgentGate](https://github.com/selfradiance/agentgate) is the enforcement substrate. Both agents post bonds. The simulation tests whether AgentGate's existing model can handle knowledge integrity governance or whether new primitives are needed.

Reuses sandbox architecture from [Agent 004 (Red Team Simulator)](https://github.com/selfradiance/agentgate-red-team-simulator) and verification patterns from [Agent 005 (Recursive Verifier)](https://github.com/selfradiance/agentgate-recursive-verifier).

## Open Design Questions

- Bond-per-write vs. bond-per-session for the saboteur
- Liability chain when poisoned knowledge causes a bad decision
- Corruption detection mechanisms (diff-based, provenance tracking, semantic integrity)
- Target agent decision domain (financial risk, security policy, resource allocation)
- Whether this becomes Agent 007 or stays a standalone name

## Related Projects

- [AgentGate](https://github.com/selfradiance/agentgate) — the core execution engine
- [Agent 004: Red Team Simulator](https://github.com/selfradiance/agentgate-red-team-simulator) — sandbox architecture reuse
- [Agent 005: Recursive Verifier](https://github.com/selfradiance/agentgate-recursive-verifier) — verification engine reuse
- [MCP Firewall](https://github.com/selfradiance/agentgate-mcp-firewall) — governs tool calls; this project asks about the data those calls return

## License

MIT
