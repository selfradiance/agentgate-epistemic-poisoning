#!/usr/bin/env node

/**
 * Epistemic Poisoning Simulator — CLI entry point.
 *
 * Usage:
 *   npx tsx src/cli.ts [options]
 *
 * Options:
 *   --rounds <n>              Number of rounds (default: 5)
 *   --runs-per-condition <n>  Runs per condition (default: 3)
 *   --mutations <n>           Mutations per round (default: 3, cap 5)
 *   --liability-mode <mode>   saboteur-only | target-only | both (default: both)
 *   --fast                    Override to 1 run per condition
 *   --stress                  Override to 10 rounds, 5 runs/condition
 *   --no-agentgate            Skip AgentGate integration
 *   --checkpoint <path>       Resume from checkpoint file
 */

import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { parseArgs } from 'node:util';
import { CampaignConfig, DEFAULT_CONFIG, FAST_CONFIG, STRESS_CONFIG } from './campaign/types.js';
import { runCampaign } from './campaign/runner.js';
import { writeCampaignLog, formatSummary } from './campaign/logger.js';
import { AgentGateClient } from './agentgate/client.js';
import { LiabilityMode } from './agentgate/types.js';

// ============================================================
// Parse CLI arguments
// ============================================================

const { values } = parseArgs({
  options: {
    rounds: { type: 'string', short: 'r' },
    'runs-per-condition': { type: 'string', short: 'n' },
    mutations: { type: 'string', short: 'm' },
    'liability-mode': { type: 'string', short: 'l' },
    fast: { type: 'boolean', short: 'f' },
    stress: { type: 'boolean', short: 's' },
    'no-agentgate': { type: 'boolean' },
    checkpoint: { type: 'string', short: 'c' },
  },
  strict: true,
});

// ============================================================
// Build config
// ============================================================

function buildConfig(): CampaignConfig {
  const config = { ...DEFAULT_CONFIG };

  // Apply presets first
  if (values.fast) {
    Object.assign(config, FAST_CONFIG);
  }
  if (values.stress) {
    Object.assign(config, STRESS_CONFIG);
  }

  // Explicit flags override presets
  if (values.rounds) {
    config.rounds = parseInt(values.rounds, 10);
  }
  if (values['runs-per-condition']) {
    config.runsPerCondition = parseInt(values['runs-per-condition'], 10);
  }
  if (values.mutations) {
    config.mutations = Math.min(parseInt(values.mutations, 10), 5);
  }
  if (values['liability-mode']) {
    const mode = values['liability-mode'].replace(/-/g, '_') as LiabilityMode;
    if (!['saboteur_only', 'target_only', 'both'].includes(mode)) {
      console.error(`Invalid liability mode: ${values['liability-mode']}`);
      console.error('Valid modes: saboteur-only, target-only, both');
      process.exit(1);
    }
    config.liabilityMode = mode;
  }

  return config;
}

// ============================================================
// Progress display
// ============================================================

function showProgress(info: { round: number; totalRounds: number; phase: string; elapsedMs: number }) {
  const elapsed = (info.elapsedMs / 1000).toFixed(1);
  const bar = '='.repeat(info.round) + '-'.repeat(info.totalRounds - info.round);
  process.stdout.write(`\r  [${bar}] Round ${info.round}/${info.totalRounds} | ${info.phase} | ${elapsed}s`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required. Set it in .env or environment.');
    process.exit(1);
  }

  const config = buildConfig();

  console.log('');
  console.log('  Epistemic Poisoning Simulator');
  console.log('  =============================');
  console.log(`  Rounds:            ${config.rounds}`);
  console.log(`  Runs/condition:    ${config.runsPerCondition}`);
  console.log(`  Mutations/round:   ${config.mutations}`);
  console.log(`  Liability mode:    ${config.liabilityMode}`);
  console.log('');

  // AgentGate setup
  let agentgate: AgentGateClient | null = null;
  if (!values['no-agentgate']) {
    const url = process.env.AGENTGATE_URL || 'http://127.0.0.1:3000';
    const restKey = process.env.AGENTGATE_REST_KEY;
    agentgate = new AgentGateClient(url, restKey);

    const healthy = await agentgate.healthCheck();
    if (!healthy) {
      console.error(`  AgentGate is not reachable at ${url}`);
      console.error('  Use --no-agentgate to skip, or start AgentGate first.');
      process.exit(1);
    }

    console.log(`  AgentGate:         connected (${url})`);

    // Register identities
    for (const role of ['saboteur', 'target', 'resolver'] as const) {
      await agentgate.ensureIdentity(role);
    }
    console.log('  Identities:        3 registered');
  } else {
    console.log('  AgentGate:         skipped');
  }

  console.log('');
  console.log('  Starting campaign...');
  console.log('');

  const checkpointPath = values.checkpoint ?? undefined;

  const result = await runCampaign(config, agentgate, showProgress, checkpointPath);

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  // Write log
  const logPath = writeCampaignLog(result);
  console.log(`  Campaign log: ${logPath}`);

  // Print summary
  console.log(formatSummary(result.summary, config.liabilityMode));

  // Per-round details
  console.log('');
  console.log('  ROUND DETAILS');
  console.log('  ' + '-'.repeat(58));
  for (const round of result.rounds) {
    const flip = round.evaluation?.metrics.decision_flipped ? 'FLIPPED' : 'no flip';
    const delta = round.evaluation?.metrics.risk_score_delta;
    const deltaStr = delta !== undefined ? (delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : 'n/a';
    const dur = (round.durationMs / 1000).toFixed(1);
    const attrs = round.evaluation?.attributions.map((a) => `${a.mutation_class}:${a.classification}`).join(', ') ?? '';

    console.log(`  R${round.roundNumber} [${round.status}] ${round.scenarioId} | ${flip} | delta: ${deltaStr} | ${dur}s`);
    if (attrs) {
      console.log(`     ${attrs}`);
    }
    if (round.error) {
      console.log(`     ERROR: ${round.error}`);
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
