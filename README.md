# Epistemic Poisoning Simulator

A two-agent adversarial simulation that tests whether [AgentGate](https://github.com/selfradiance/agentgate)'s bond-and-slash model can govern **knowledge integrity** — not just action integrity. A saboteur agent subtly corrupts shared knowledge to cause a target agent to make catastrophic financial decisions.

## Why This Exists

RAG-heavy architectures are the industry default. Agents read from shared knowledge bases and make decisions based on what they find. But nobody is stress-testing the knowledge supply chain. What happens when the data itself is poisoned — not obviously, but subtly enough that the agent trusts it?

This project extends AgentGate's thesis from "agents are accountable for what they do" to "agents are accountable for what they know and what they tell other agents."

## How It Works

```
Saboteur Agent ──→ Knowledge Base ←── Target Agent
  (7 mutation        (fragment-level       (Tool Use,
   taxonomy)          with sha256)          temperature 0)
      │                    │                     │
      │  bond: 10¢/write   │  snapshot/restore   │  bond: 50¢/decision
      │                    │                     │
      └──────── AgentGate (Ed25519 signed) ─────┘
                        │
               Resolver (3 liability modes)
                        │
              Settlement per action
```

1. **Saboteur** generates subtle mutations across 7 categories (numerical drift, definitional swap, causal inversion, omission, injection, temporal shift, scope manipulation)
2. **Target** reads the knowledge base and makes a financial risk assessment decision, citing specific fragments
3. **Evaluator** runs dual-condition comparison (clean vs poisoned KB), checks stability, oracle alignment, and runs a causal attribution chain
4. **Resolver** settles bonds per the liability rules table (saboteur_only, target_only, or both)
5. **Adaptive feedback** feeds evaluation results back to the saboteur for the next round

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Run the test suite (129 tests)
npx vitest run

# Run a campaign (5 rounds, both-mode liability)
npx tsx src/cli.ts --rounds 5 --liability-mode both

# Fast mode (1 run per condition)
npx tsx src/cli.ts --fast

# Without AgentGate (skip bond integration)
npx tsx src/cli.ts --no-agentgate

# Resume from checkpoint
npx tsx src/cli.ts --checkpoint logs/checkpoint.json
```

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--rounds <n>` | 5 | Number of rounds |
| `--runs-per-condition <n>` | 3 | Runs per condition (clean and poisoned) |
| `--mutations <n>` | 3 | Mutations per round (max 5) |
| `--liability-mode <mode>` | both | `saboteur-only`, `target-only`, or `both` |
| `--fast` | — | Override to 1 run per condition |
| `--stress` | — | 10 rounds, 5 runs per condition |
| `--no-agentgate` | — | Skip AgentGate bond integration |
| `--checkpoint <path>` | — | Resume from a checkpoint file |

## What It Measures

- **Decision flip rate** — how often poisoning reverses the target's approve/reject decision
- **Risk score delta** — mean shift in risk scores between clean and poisoned conditions
- **Causal attribution** — whether flipped decisions can be traced to specific poisoned fragments
- **Bond outcomes** — saboteur/target bond settlements across liability modes

## Output

Each campaign produces:
- **Campaign log** — full JSON record in `logs/{campaignId}.json`
- **Per-round trace artifacts** — 7 files per round in `logs/{campaignId}/round-{N}-{roundId}/`
  - `trace.json` — round metadata
  - `transcripts.json` — full prompt/response transcripts
  - `mutations.json` — mutation diffs with provenance
  - `citations.json` — target citation mappings (clean vs poisoned)
  - `agentgate.json` — bond/action request/response logs
  - `timing.json` — per-phase duration breakdown
  - `attributions.json` — causal attribution chain results

## Architecture

```
src/
  cli.ts                — CLI entry point
  anthropic-client.ts   — Lazy-initialized shared Claude client
  kb/                   — Fragment-level knowledge base with snapshot/restore
  agents/saboteur/      — 7-category mutation taxonomy, adaptive feedback
  agents/target/        — Tool Use target with citation tracking
  oracle/               — Deterministic risk calculator (ground truth)
  eval/                 — Stability gate, oracle alignment, attribution chain
  agentgate/            — Ed25519 signing, bond client, resolver logic
  campaign/             — Round orchestration, checkpointing, CLI output
  trace/                — Per-round artifact collection and writing
```

## Related Projects

- [AgentGate](https://github.com/selfradiance/agentgate) — the bond-and-slash execution engine
- [Agent 004: Red Team Simulator](https://github.com/selfradiance/agentgate-red-team-simulator) — adversarial testing of AgentGate's defenses
- [Agent 005: Recursive Verifier](https://github.com/selfradiance/agentgate-recursive-verifier) — formal verification of agent code
- [MCP Firewall](https://github.com/selfradiance/agentgate-mcp-firewall) — governs tool calls; this project asks about the data those calls return

## License

MIT
