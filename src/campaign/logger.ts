/**
 * Campaign logging — JSON log files and checkpoint management.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MutationSchema } from '../agents/saboteur/types.js';
import { TargetDecisionSchema } from '../agents/target/types.js';
import { OracleOutputSchema } from '../oracle/types.js';
import { CampaignResult, CampaignCheckpoint, CampaignSummary } from './types.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

const AttributionClassificationSchema = z.enum([
  'poisoning_caused',
  'poisoning_correlated',
  'noise',
  'baseline_error',
]);

const RoundStatusSchema = z.enum([
  'valid',
  'baseline_unstable',
  'poisoned_unstable',
  'baseline_error',
  'poison_too_obvious',
]);

const CampaignRoundStatusSchema = z.enum([
  'valid',
  'baseline_unstable',
  'poisoned_unstable',
  'baseline_error',
  'poison_too_obvious',
  'invalid_round',
  'aborted',
]);

const ResolverSettlementSchema = z.object({
  actionId: z.string(),
  outcome: z.enum(['success', 'failed', 'malicious']),
});

const MutationFeedbackSchema = z.object({
  category: z.string(),
  fragment_id: z.string(),
  flipped_decision: z.boolean(),
  risk_score_delta: z.number(),
  was_cited: z.boolean(),
});

const SaboteurFeedbackSchema = z.object({
  round_number: z.number().int().nonnegative(),
  prior_mutations: z.array(MutationFeedbackSchema),
  summary: z.string(),
  is_degenerate: z.boolean(),
});

const StabilityResultSchema = z.object({
  clean_agreement: z.number(),
  poisoned_agreement: z.number(),
  clean_stable: z.boolean(),
  poisoned_stable: z.boolean(),
});

const OracleAlignmentSchema = z.object({
  clean_matches_oracle: z.boolean(),
  poisoned_matches_oracle: z.boolean(),
  clean_majority_decision: z.enum(['approve', 'reject']),
  poisoned_majority_decision: z.enum(['approve', 'reject']),
});

const ContinuousMetricsSchema = z.object({
  decision_flipped: z.boolean(),
  risk_score_delta: z.number(),
  confidence_delta: z.number(),
  loss_estimate_delta: z.number(),
  clean_risk_score_mean: z.number(),
  poisoned_risk_score_mean: z.number(),
  clean_distance_from_oracle: z.number(),
  poisoned_distance_from_oracle: z.number(),
});

const AttributionResultSchema = z.object({
  fragment_id: z.string(),
  mutation_class: z.string(),
  classification: AttributionClassificationSchema,
  cited_in_poisoned_runs: z.boolean(),
  facts_reference_mutation: z.boolean(),
  decision_impact: z.boolean(),
});

const EvaluatorResultSchema = z.object({
  stability: StabilityResultSchema,
  oracle_alignment: OracleAlignmentSchema,
  metrics: ContinuousMetricsSchema,
  attributions: z.array(AttributionResultSchema),
  round_status: RoundStatusSchema,
});

const CampaignConfigSchema = z.object({
  rounds: z.number().int().positive(),
  runsPerCondition: z.number().int().positive(),
  mutations: z.number().int().min(1).max(5),
  liabilityMode: z.enum(['saboteur_only', 'target_only', 'both']),
  scenarioIndex: z.number().int().nonnegative().optional(),
});

const RoundResultSchema = z.object({
  roundId: z.string(),
  roundNumber: z.number().int().positive(),
  scenarioId: z.string(),
  status: CampaignRoundStatusSchema,
  mutationCount: z.number().int().nonnegative(),
  mutationClasses: z.array(z.string()),
  cleanDecisions: z.array(TargetDecisionSchema),
  poisonedDecisions: z.array(TargetDecisionSchema),
  oracle: OracleOutputSchema,
  mutations: z.array(MutationSchema),
  evaluation: EvaluatorResultSchema.nullable(),
  settlements: z.array(ResolverSettlementSchema),
  feedback: SaboteurFeedbackSchema.nullable(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
});

const CampaignCheckpointSchema = z.object({
  campaignId: z.string().min(1),
  config: CampaignConfigSchema,
  completedRounds: z.array(RoundResultSchema),
  lastFeedback: SaboteurFeedbackSchema.nullable(),
  nextRound: z.number().int().positive(),
});

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// ============================================================
// Campaign log
// ============================================================

export function writeCampaignLog(result: CampaignResult): string {
  ensureLogsDir();
  const filename = `${result.campaignId}.json`;
  const filepath = path.join(LOGS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return filepath;
}

// ============================================================
// Checkpoint
// ============================================================

export function writeCheckpoint(filepath: string, checkpoint: CampaignCheckpoint): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(checkpoint, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}

export function loadCheckpoint(filepath: string): CampaignCheckpoint | null {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    const parsed = CampaignCheckpointSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`  Checkpoint file ${filepath} failed validation: ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`  Unexpected error loading checkpoint ${filepath}: ${err}`);
    }
    return null;
  }
}

// ============================================================
// Summary formatting for CLI output
// ============================================================

export function formatSummary(summary: CampaignSummary, liabilityMode: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  CAMPAIGN SUMMARY');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`  Liability Mode:       ${liabilityMode}`);
  lines.push(`  Total Rounds:         ${summary.totalRounds}`);
  lines.push(`  Valid Rounds:         ${summary.validRounds}`);
  lines.push(`  Baseline Unstable:    ${summary.baselineUnstableRounds}`);
  lines.push(`  Poisoned Unstable:    ${summary.poisonedUnstableRounds}`);
  lines.push(`  Baseline Error:       ${summary.baselineErrorRounds}`);
  lines.push(`  Poison Too Obvious:   ${summary.poisonTooObviousRounds}`);
  lines.push(`  Invalid Rounds:       ${summary.invalidRounds}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  POISONING EFFECTIVENESS');
  lines.push('-'.repeat(60));
  lines.push(`  Decision Flip Rate:   ${(summary.decisionFlipRate * 100).toFixed(1)}%`);
  lines.push(`  Mean Risk Delta:      ${summary.meanRiskScoreDelta >= 0 ? '+' : ''}${summary.meanRiskScoreDelta.toFixed(4)}`);
  lines.push(`  Mean Confidence Delta: ${summary.meanConfidenceDelta >= 0 ? '+' : ''}${summary.meanConfidenceDelta.toFixed(4)}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  ATTRIBUTION BREAKDOWN');
  lines.push('-'.repeat(60));
  lines.push(`  Poisoning Caused:     ${summary.attributionBreakdown.poisoning_caused}`);
  lines.push(`  Poisoning Correlated: ${summary.attributionBreakdown.poisoning_correlated}`);
  lines.push(`  Noise:                ${summary.attributionBreakdown.noise}`);
  lines.push(`  Baseline Error:       ${summary.attributionBreakdown.baseline_error}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  BOND OUTCOMES');
  lines.push('-'.repeat(60));
  lines.push(`  Saboteur Malicious:   ${summary.bondOutcomes.saboteurMalicious}`);
  lines.push(`  Saboteur Failed:      ${summary.bondOutcomes.saboteurFailed}`);
  lines.push(`  Saboteur Success:     ${summary.bondOutcomes.saboteurSuccess}`);
  lines.push(`  Target Malicious:     ${summary.bondOutcomes.targetMalicious}`);
  lines.push(`  Target Failed:        ${summary.bondOutcomes.targetFailed}`);
  lines.push(`  Target Success:       ${summary.bondOutcomes.targetSuccess}`);
  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
