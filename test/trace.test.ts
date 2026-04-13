import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TraceCollector } from '../src/trace/collector.js';
import { writeRoundTrace } from '../src/trace/writer.js';
import { PROMPT_VERSION, RoundTrace } from '../src/trace/types.js';
import { TargetDecision } from '../src/agents/target/types.js';
import { EvaluatorResult } from '../src/eval/types.js';
import { Mutation } from '../src/agents/saboteur/types.js';

// ============================================================
// Helpers
// ============================================================

function makeDecision(overrides: Partial<TargetDecision> = {}): TargetDecision {
  return {
    facts: [],
    citations: [{ doc_id: 'policy_v2', fragment_id: 'policy_v2_f3', quoted_text: 'test' }],
    risk_factors: [],
    decision: 'approve',
    risk_score: 0.35,
    confidence: 0.95,
    loss_estimate: 10000,
    ...overrides,
  };
}

function makeMutation(): Mutation {
  return {
    fragment_id: 'policy_v2_f3',
    doc_id: 'policy_v2',
    mutation_class: 'numerical_drift',
    original_text: 'threshold 0.40',
    mutated_text: 'threshold 0.35',
    diff_hash: 'abc123',
    description: 'shift threshold',
  };
}

function makeEvalResult(): EvaluatorResult {
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
    attributions: [{
      fragment_id: 'policy_v2_f3',
      mutation_class: 'numerical_drift',
      classification: 'poisoning_caused',
      cited_in_poisoned_runs: true,
      facts_reference_mutation: true,
      decision_impact: true,
    }],
    round_status: 'valid',
  };
}

// ============================================================
// TraceCollector
// ============================================================

describe('TraceCollector', () => {
  it('builds a complete RoundTrace', () => {
    const collector = new TraceCollector('round_test1', 1, 'applicant_001');

    // Add transcript
    collector.addTranscript({
      role: 'target',
      promptVersion: PROMPT_VERSION,
      prompt: 'test prompt...',
      responseBlocks: [{ type: 'tool_use', content: '{"decision":"approve"}' }],
      model: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 2000,
    });

    // Record mutations
    collector.recordMutations([makeMutation()]);

    // Record citations
    collector.recordCitations(
      [makeDecision()],
      'clean',
      ['policy_v2_f3'],
    );
    collector.recordCitations(
      [makeDecision({ decision: 'reject' })],
      'poisoned',
      ['policy_v2_f3'],
    );

    // Record phase timing
    collector.recordPhase('saboteur', new Date(), 1000);
    collector.recordPhase('target-clean', new Date(), 5000);
    collector.recordPhase('target-poisoned', new Date(), 5000);

    // Record attributions
    collector.recordAttributions(makeEvalResult());

    // AgentGate log
    collector.addAgentGateLog({
      timestamp: new Date().toISOString(),
      operation: 'lockBond',
      role: 'saboteur',
      request: { amountCents: 100 },
      response: { bondId: 'bond_test' },
      durationMs: 10,
    });

    const trace = collector.build();

    expect(trace.roundId).toBe('round_test1');
    expect(trace.roundNumber).toBe(1);
    expect(trace.scenarioId).toBe('applicant_001');
    expect(trace.promptVersion).toBe(PROMPT_VERSION);
    expect(trace.transcripts).toHaveLength(1);
    expect(trace.mutationDiffs).toHaveLength(1);
    expect(trace.citationMappings).toHaveLength(2);
    expect(trace.phaseTimings).toHaveLength(3);
    expect(trace.attributionDetails).toHaveLength(1);
    expect(trace.agentgateLogs).toHaveLength(1);
  });

  it('maps citations with isPoisoned flag', () => {
    const collector = new TraceCollector('round_test2', 1, 'test');
    collector.recordCitations(
      [makeDecision({
        citations: [
          { doc_id: 'p', fragment_id: 'policy_v2_f3', quoted_text: 'x' },
          { doc_id: 'p', fragment_id: 'policy_v2_f4', quoted_text: 'y' },
        ],
      })],
      'poisoned',
      ['policy_v2_f3'],
    );

    const trace = collector.build();
    const cites = trace.citationMappings[0].citations;
    expect(cites[0].isPoisoned).toBe(true);
    expect(cites[1].isPoisoned).toBe(false);
  });

  it('records attribution details from evaluator', () => {
    const collector = new TraceCollector('round_test3', 1, 'test');
    collector.recordAttributions(makeEvalResult());
    const trace = collector.build();

    expect(trace.attributionDetails[0].classification).toBe('poisoning_caused');
    expect(trace.attributionDetails[0].cleanMajority).toBe('approve');
    expect(trace.attributionDetails[0].poisonedMajority).toBe('reject');
    expect(trace.attributionDetails[0].riskScoreDelta).toBe(0.20);
  });
});

// ============================================================
// writeRoundTrace
// ============================================================

describe('writeRoundTrace', () => {
  const testCampaignId = 'campaign_tracetest';
  const testDir = path.join(process.cwd(), 'logs', testCampaignId);

  afterAll(() => {
    // Clean up test trace directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('writes all trace artifact files', () => {
    const collector = new TraceCollector('round_wt1', 1, 'test');
    collector.recordMutations([makeMutation()]);
    collector.recordPhase('saboteur', new Date(), 1000);
    collector.recordAttributions(makeEvalResult());

    const trace = collector.build();
    const dir = writeRoundTrace(testCampaignId, trace);

    expect(fs.existsSync(path.join(dir, 'trace.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'transcripts.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'mutations.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'citations.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'agentgate.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'timing.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'attributions.json'))).toBe(true);

    // Verify trace.json is valid
    const loaded = JSON.parse(fs.readFileSync(path.join(dir, 'trace.json'), 'utf8')) as RoundTrace;
    expect(loaded.roundId).toBe('round_wt1');
    expect(loaded.mutationDiffs).toHaveLength(1);
    expect(loaded.attributionDetails).toHaveLength(1);
  });
});

// ============================================================
// PROMPT_VERSION
// ============================================================

describe('PROMPT_VERSION', () => {
  it('is a semantic version string', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
