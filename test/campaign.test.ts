import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeSummary, runCampaign } from '../src/campaign/runner.js';
import { writeCampaignLog, writeCheckpoint, loadCheckpoint, formatSummary } from '../src/campaign/logger.js';
import {
  CampaignConfig,
  DEFAULT_CONFIG,
  FAST_CONFIG,
  STRESS_CONFIG,
  RoundResult,
  CampaignResult,
  CampaignCheckpoint,
  CampaignSummary,
} from '../src/campaign/types.js';
import { TargetDecision } from '../src/agents/target/types.js';
import { EvaluatorResult } from '../src/eval/types.js';

// ============================================================
// Helpers
// ============================================================

function makeDecision(overrides: Partial<TargetDecision> = {}): TargetDecision {
  return {
    facts: [],
    citations: [],
    risk_factors: [],
    decision: 'approve',
    risk_score: 0.35,
    confidence: 0.95,
    loss_estimate: 10000,
    ...overrides,
  };
}

function makeEvalResult(overrides: Partial<EvaluatorResult> = {}): EvaluatorResult {
  return {
    stability: { clean_agreement: 1, poisoned_agreement: 1, clean_stable: true, poisoned_stable: true },
    oracle_alignment: {
      clean_matches_oracle: true,
      poisoned_matches_oracle: false,
      clean_majority_decision: 'approve',
      poisoned_majority_decision: 'reject',
    },
    metrics: {
      decision_flipped: true,
      risk_score_delta: 0.20,
      confidence_delta: -0.10,
      loss_estimate_delta: 5000,
      clean_risk_score_mean: 0.35,
      poisoned_risk_score_mean: 0.55,
      clean_distance_from_oracle: 0.0,
      poisoned_distance_from_oracle: 0.20,
    },
    attributions: [
      {
        fragment_id: 'policy_v2_f3',
        mutation_class: 'numerical_drift',
        classification: 'poisoning_caused',
        cited_in_poisoned_runs: true,
        facts_reference_mutation: true,
        decision_impact: true,
      },
    ],
    round_status: 'valid',
    ...overrides,
  };
}

function makeRoundResult(roundNumber: number, overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    roundId: `round_test${roundNumber}`,
    roundNumber,
    scenarioId: 'applicant_001',
    status: 'valid',
    mutationCount: 1,
    mutationClasses: ['numerical_drift'],
    cleanDecisions: [makeDecision()],
    poisonedDecisions: [makeDecision({ decision: 'reject', risk_score: 0.55 })],
    oracle: {
      applicant_id: 'applicant_001',
      canonical_decision: 'approve',
      expected_risk_band: { low: 0.30, high: 0.40 },
      expected_loss_band: { low: 8000, high: 12000 },
      rules_applied: [],
    },
    mutations: [{
      fragment_id: 'policy_v2_f3',
      doc_id: 'policy_v2',
      mutation_class: 'numerical_drift',
      original_text: 'a',
      mutated_text: 'b',
      diff_hash: 'h',
      description: 'd',
    }],
    evaluation: makeEvalResult(),
    settlements: [
      { actionId: 'act_sab1', outcome: 'malicious' },
      { actionId: 'act_tgt1', outcome: 'success' },
    ],
    feedback: null,
    durationMs: 5000,
    ...overrides,
  };
}

// ============================================================
// Config defaults
// ============================================================

describe('CampaignConfig', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_CONFIG.rounds).toBe(5);
    expect(DEFAULT_CONFIG.runsPerCondition).toBe(3);
    expect(DEFAULT_CONFIG.mutations).toBe(3);
    expect(DEFAULT_CONFIG.liabilityMode).toBe('both');
  });

  it('fast config overrides runs to 1', () => {
    expect(FAST_CONFIG.runsPerCondition).toBe(1);
  });

  it('stress config overrides rounds to 10 and runs to 5', () => {
    expect(STRESS_CONFIG.rounds).toBe(10);
    expect(STRESS_CONFIG.runsPerCondition).toBe(5);
  });
});

// ============================================================
// computeSummary
// ============================================================

describe('computeSummary', () => {
  it('computes correct flip rate from valid rounds', () => {
    const rounds = [
      makeRoundResult(1), // flipped
      makeRoundResult(2), // flipped
      makeRoundResult(3, {
        evaluation: makeEvalResult({
          metrics: {
            decision_flipped: false,
            risk_score_delta: 0.02,
            confidence_delta: -0.01,
            loss_estimate_delta: 500,
            clean_risk_score_mean: 0.35,
            poisoned_risk_score_mean: 0.37,
            clean_distance_from_oracle: 0.0,
            poisoned_distance_from_oracle: 0.02,
          },
        }),
      }),
    ];
    const summary = computeSummary(rounds);
    expect(summary.decisionFlipRate).toBeCloseTo(2 / 3, 4);
    expect(summary.validRounds).toBe(3);
  });

  it('counts round statuses correctly', () => {
    const rounds = [
      makeRoundResult(1, { status: 'valid' }),
      makeRoundResult(2, { status: 'baseline_unstable' }),
      makeRoundResult(3, { status: 'invalid_round', evaluation: null }),
      makeRoundResult(4, { status: 'poisoned_unstable' }),
    ];
    const summary = computeSummary(rounds);
    expect(summary.totalRounds).toBe(4);
    expect(summary.baselineUnstableRounds).toBe(1);
    expect(summary.poisonedUnstableRounds).toBe(1);
    expect(summary.invalidRounds).toBe(1);
  });

  it('only counts status=valid rounds in poisoning-effectiveness metrics', () => {
    const rounds = [
      makeRoundResult(1, { status: 'valid' }),
      makeRoundResult(2, { status: 'baseline_error' }),
      makeRoundResult(3, { status: 'poisoned_unstable' }),
    ];

    const summary = computeSummary(rounds);

    expect(summary.validRounds).toBe(1);
    expect(summary.decisionFlipRate).toBe(1);
  });

  it('aggregates attribution breakdown', () => {
    const rounds = [
      makeRoundResult(1, {
        evaluation: makeEvalResult({
          attributions: [
            { fragment_id: 'f1', mutation_class: 'drift', classification: 'poisoning_caused', cited_in_poisoned_runs: true, facts_reference_mutation: true, decision_impact: true },
            { fragment_id: 'f2', mutation_class: 'omission', classification: 'noise', cited_in_poisoned_runs: false, facts_reference_mutation: false, decision_impact: false },
          ],
        }),
      }),
      makeRoundResult(2, {
        evaluation: makeEvalResult({
          attributions: [
            { fragment_id: 'f3', mutation_class: 'swap', classification: 'poisoning_correlated', cited_in_poisoned_runs: false, facts_reference_mutation: false, decision_impact: true },
          ],
        }),
      }),
    ];
    const summary = computeSummary(rounds);
    expect(summary.attributionBreakdown.poisoning_caused).toBe(1);
    expect(summary.attributionBreakdown.poisoning_correlated).toBe(1);
    expect(summary.attributionBreakdown.noise).toBe(1);
  });

  it('counts bond outcomes', () => {
    const rounds = [
      makeRoundResult(1, {
        settlements: [
          { actionId: 'sab1', outcome: 'malicious' },
          { actionId: 'sab2', outcome: 'success' },
          { actionId: 'tgt1', outcome: 'success' }, // last = target
        ],
      }),
      makeRoundResult(2, {
        settlements: [
          { actionId: 'sab3', outcome: 'success' },
          { actionId: 'tgt2', outcome: 'malicious' }, // last = target
        ],
      }),
    ];
    const summary = computeSummary(rounds);
    expect(summary.bondOutcomes.saboteurMalicious).toBe(1);
    expect(summary.bondOutcomes.saboteurSuccess).toBe(2);
    expect(summary.bondOutcomes.targetMalicious).toBe(1);
    expect(summary.bondOutcomes.targetSuccess).toBe(1);
  });

  it('handles empty rounds array', () => {
    const summary = computeSummary([]);
    expect(summary.totalRounds).toBe(0);
    expect(summary.decisionFlipRate).toBe(0);
    expect(summary.meanRiskScoreDelta).toBe(0);
  });
});

// ============================================================
// Checkpoint save/load
// ============================================================

describe('checkpoint', () => {
  const tmpPath = path.join(process.cwd(), 'test-checkpoint-tmp.json');

  it('writes and loads checkpoint correctly', () => {
    const checkpoint: CampaignCheckpoint = {
      campaignId: 'campaign_test',
      config: DEFAULT_CONFIG,
      completedRounds: [makeRoundResult(1)],
      lastFeedback: {
        round_number: 1,
        prior_mutations: [],
        summary: 'test',
        is_degenerate: false,
      },
      nextRound: 2,
    };

    writeCheckpoint(tmpPath, checkpoint);
    const loaded = loadCheckpoint(tmpPath);

    expect(loaded).not.toBeNull();
    expect(loaded!.campaignId).toBe('campaign_test');
    expect(loaded!.nextRound).toBe(2);
    expect(loaded!.completedRounds).toHaveLength(1);

    // Clean up
    fs.unlinkSync(tmpPath);
  });

  it('returns null for non-existent checkpoint', () => {
    const loaded = loadCheckpoint('/tmp/nonexistent-checkpoint.json');
    expect(loaded).toBeNull();
  });

  it('returns null for malformed checkpoint contents', () => {
    fs.writeFileSync(tmpPath, JSON.stringify({ campaignId: 'bad', nextRound: 'oops' }), 'utf8');
    const loaded = loadCheckpoint(tmpPath);
    expect(loaded).toBeNull();
    fs.unlinkSync(tmpPath);
  });

  it('preserves campaignId when resuming from a completed checkpoint', async () => {
    const checkpoint: CampaignCheckpoint = {
      campaignId: 'campaign_resume',
      config: { ...DEFAULT_CONFIG, rounds: 1 },
      completedRounds: [makeRoundResult(1)],
      lastFeedback: null,
      nextRound: 2,
    };

    writeCheckpoint(tmpPath, checkpoint);

    const result = await runCampaign({ ...DEFAULT_CONFIG, rounds: 1 }, null, undefined, tmpPath);

    expect(result.campaignId).toBe('campaign_resume');
    expect(result.rounds).toHaveLength(1);

    fs.unlinkSync(tmpPath);
  });
});

// ============================================================
// formatSummary
// ============================================================

describe('formatSummary', () => {
  it('produces readable output with all sections', () => {
    const summary: CampaignSummary = {
      totalRounds: 5,
      validRounds: 4,
      baselineUnstableRounds: 1,
      poisonedUnstableRounds: 0,
      baselineErrorRounds: 0,
      poisonTooObviousRounds: 0,
      invalidRounds: 0,
      decisionFlipRate: 0.75,
      meanRiskScoreDelta: 0.15,
      meanConfidenceDelta: -0.05,
      attributionBreakdown: {
        poisoning_caused: 3,
        poisoning_correlated: 1,
        noise: 2,
        baseline_error: 0,
      },
      bondOutcomes: {
        saboteurMalicious: 3,
        saboteurFailed: 0,
        saboteurSuccess: 2,
        targetMalicious: 1,
        targetFailed: 0,
        targetSuccess: 4,
      },
    };

    const output = formatSummary(summary, 'both');
    expect(output).toContain('CAMPAIGN SUMMARY');
    expect(output).toContain('both');
    expect(output).toContain('75.0%');
    expect(output).toContain('+0.1500');
    expect(output).toContain('ATTRIBUTION BREAKDOWN');
    expect(output).toContain('BOND OUTCOMES');
  });
});

// ============================================================
// Campaign log write
// ============================================================

describe('writeCampaignLog', () => {
  it('writes JSON log file and returns path', () => {
    const result: CampaignResult = {
      campaignId: 'campaign_logtest',
      config: DEFAULT_CONFIG,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      rounds: [makeRoundResult(1)],
      summary: computeSummary([makeRoundResult(1)]),
    };

    const logPath = writeCampaignLog(result);
    expect(logPath).toContain('campaign_logtest.json');
    expect(fs.existsSync(logPath)).toBe(true);

    const loaded = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    expect(loaded.campaignId).toBe('campaign_logtest');

    // Clean up
    fs.unlinkSync(logPath);
  });
});
