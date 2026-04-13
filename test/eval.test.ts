import { describe, it, expect } from 'vitest';
import { computeStability, computeOracleAlignment, computeMetrics, evaluate } from '../src/eval/evaluator.js';
import { runAttributionChain } from '../src/eval/attribution.js';
import { ATTRIBUTION_FIXTURES } from '../fixtures/attribution-fixtures.js';
import { TargetDecision } from '../src/agents/target/types.js';
import { DocumentStore } from '../src/kb/store.js';
import { formatKB } from '../src/kb/formatter.js';
import { APPLICANT_SCENARIOS, getKBForScenario } from '../src/kb/seed-data.js';
import { computeOracle } from '../src/oracle/oracle.js';
import { runTarget } from '../src/agents/target/target.js';
import { generateMutations } from '../src/agents/saboteur/saboteur.js';

// ============================================================
// Helper
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

// ============================================================
// computeStability
// ============================================================

describe('computeStability', () => {
  it('detects stable clean runs (100% agreement)', () => {
    const clean = [
      makeDecision({ decision: 'approve' }),
      makeDecision({ decision: 'approve' }),
      makeDecision({ decision: 'approve' }),
    ];
    const poisoned = [makeDecision({ decision: 'reject' })];
    const result = computeStability(clean, poisoned);
    expect(result.clean_agreement).toBe(1.0);
    expect(result.clean_stable).toBe(true);
  });

  it('detects unstable clean runs (<80%)', () => {
    const clean = [
      makeDecision({ decision: 'approve' }),
      makeDecision({ decision: 'reject' }),
      makeDecision({ decision: 'reject' }),
      makeDecision({ decision: 'approve' }),
      makeDecision({ decision: 'approve' }),
    ];
    const poisoned = [makeDecision()];
    const result = computeStability(clean, poisoned);
    expect(result.clean_agreement).toBe(0.6);
    expect(result.clean_stable).toBe(false);
  });

  it('computes poisoned agreement separately', () => {
    const clean = [makeDecision({ decision: 'approve' })];
    const poisoned = [
      makeDecision({ decision: 'reject' }),
      makeDecision({ decision: 'reject' }),
      makeDecision({ decision: 'approve' }),
    ];
    const result = computeStability(clean, poisoned);
    expect(result.poisoned_agreement).toBeCloseTo(0.667, 2);
    expect(result.poisoned_stable).toBe(false);
  });
});

// ============================================================
// computeOracleAlignment
// ============================================================

describe('computeOracleAlignment', () => {
  it('detects when clean matches oracle', () => {
    const clean = [makeDecision({ decision: 'approve' })];
    const poisoned = [makeDecision({ decision: 'reject' })];
    const oracle = { applicant_id: 'a', canonical_decision: 'approve' as const, expected_risk_band: { low: 0.3, high: 0.4 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] };
    const result = computeOracleAlignment(clean, poisoned, oracle);
    expect(result.clean_matches_oracle).toBe(true);
    expect(result.poisoned_matches_oracle).toBe(false);
  });

  it('detects when clean disagrees with oracle', () => {
    const clean = [makeDecision({ decision: 'reject' })];
    const poisoned = [makeDecision({ decision: 'reject' })];
    const oracle = { applicant_id: 'a', canonical_decision: 'approve' as const, expected_risk_band: { low: 0.3, high: 0.4 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] };
    const result = computeOracleAlignment(clean, poisoned, oracle);
    expect(result.clean_matches_oracle).toBe(false);
  });
});

// ============================================================
// computeMetrics
// ============================================================

describe('computeMetrics', () => {
  it('computes mean risk score deltas', () => {
    const clean = [
      makeDecision({ risk_score: 0.30 }),
      makeDecision({ risk_score: 0.40 }),
    ];
    const poisoned = [
      makeDecision({ risk_score: 0.60 }),
      makeDecision({ risk_score: 0.70 }),
    ];
    const oracle = { applicant_id: 'a', canonical_decision: 'approve' as const, expected_risk_band: { low: 0.30, high: 0.40 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] };
    const result = computeMetrics(clean, poisoned, oracle);
    expect(result.clean_risk_score_mean).toBeCloseTo(0.35, 4);
    expect(result.poisoned_risk_score_mean).toBeCloseTo(0.65, 4);
    expect(result.risk_score_delta).toBeCloseTo(0.30, 4);
  });

  it('detects decision flip', () => {
    const clean = [makeDecision({ decision: 'approve' }), makeDecision({ decision: 'approve' })];
    const poisoned = [makeDecision({ decision: 'reject' }), makeDecision({ decision: 'reject' })];
    const oracle = { applicant_id: 'a', canonical_decision: 'approve' as const, expected_risk_band: { low: 0.3, high: 0.4 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] };
    const result = computeMetrics(clean, poisoned, oracle);
    expect(result.decision_flipped).toBe(true);
  });

  it('computes distance from oracle', () => {
    const clean = [makeDecision({ risk_score: 0.50 })];
    const poisoned = [makeDecision({ risk_score: 0.80 })];
    const oracle = { applicant_id: 'a', canonical_decision: 'approve' as const, expected_risk_band: { low: 0.30, high: 0.40 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] };
    const result = computeMetrics(clean, poisoned, oracle);
    // Oracle midpoint = 0.35
    expect(result.clean_distance_from_oracle).toBeCloseTo(0.15, 4);
    expect(result.poisoned_distance_from_oracle).toBeCloseTo(0.45, 4);
  });
});

// ============================================================
// Attribution chain
// ============================================================

describe('runAttributionChain', () => {
  it('classifies as poisoning_caused when cited and decision flipped', () => {
    const results = runAttributionChain({
      poisonedDecisions: [
        makeDecision({
          decision: 'reject',
          citations: [{ doc_id: 'p', fragment_id: 'f1', quoted_text: 'x' }],
          facts: [{ fragment_id: 'f1', extracted_value: 'val' }],
        }),
      ],
      cleanMatchesOracle: true,
      decisionFlipped: true,
      mutations: [{ fragment_id: 'f1', doc_id: 'p', mutation_class: 'drift', original_text: 'a', mutated_text: 'b', diff_hash: 'h', description: 'd' }],
      poisonedFragmentIds: ['f1'],
    });
    expect(results[0].classification).toBe('poisoning_caused');
  });

  it('classifies as noise when no decision flip', () => {
    const results = runAttributionChain({
      poisonedDecisions: [makeDecision()],
      cleanMatchesOracle: true,
      decisionFlipped: false,
      mutations: [{ fragment_id: 'f1', doc_id: 'p', mutation_class: 'drift', original_text: 'a', mutated_text: 'b', diff_hash: 'h', description: 'd' }],
      poisonedFragmentIds: ['f1'],
    });
    expect(results[0].classification).toBe('noise');
  });

  it('classifies as baseline_error when clean doesnt match oracle', () => {
    const results = runAttributionChain({
      poisonedDecisions: [makeDecision({ decision: 'reject' })],
      cleanMatchesOracle: false,
      decisionFlipped: true,
      mutations: [{ fragment_id: 'f1', doc_id: 'p', mutation_class: 'drift', original_text: 'a', mutated_text: 'b', diff_hash: 'h', description: 'd' }],
      poisonedFragmentIds: ['f1'],
    });
    expect(results[0].classification).toBe('baseline_error');
  });
});

// ============================================================
// Attribution fixtures — evaluator must pass all 7
// ============================================================

describe('Attribution Fixtures', () => {
  for (const fixture of ATTRIBUTION_FIXTURES) {
    it(`passes fixture: ${fixture.name} — ${fixture.description}`, () => {
      const result = evaluate(fixture.input);

      expect(result.round_status).toBe(fixture.expected.round_status);
      expect(result.metrics.decision_flipped).toBe(fixture.expected.decision_flipped);

      expect(result.attributions).toHaveLength(fixture.expected.attributions.length);
      for (let i = 0; i < fixture.expected.attributions.length; i++) {
        expect(result.attributions[i].fragment_id).toBe(fixture.expected.attributions[i].fragment_id);
        expect(result.attributions[i].classification).toBe(fixture.expected.attributions[i].classification);
      }
    });
  }
});

// ============================================================
// Full evaluator integration
// ============================================================

describe('evaluate', () => {
  it('returns baseline_unstable when clean agreement < 80%', () => {
    const result = evaluate({
      cleanDecisions: [
        makeDecision({ decision: 'approve' }),
        makeDecision({ decision: 'reject' }),
        makeDecision({ decision: 'approve' }),
        makeDecision({ decision: 'reject' }),
        makeDecision({ decision: 'reject' }),
      ],
      poisonedDecisions: [makeDecision({ decision: 'reject' })],
      oracleOutput: { applicant_id: 'a', canonical_decision: 'approve', expected_risk_band: { low: 0.3, high: 0.4 }, expected_loss_band: { low: 8000, high: 12000 }, rules_applied: [] },
      mutations: [],
      poisonedFragmentIds: [],
    });
    expect(result.round_status).toBe('baseline_unstable');
  });
});

// ============================================================
// SIGN OF LIFE — full round without AgentGate (live API)
// ============================================================

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_API_KEY)('SIGN OF LIFE — full round end-to-end', () => {
  it('runs saboteur → target (clean + poisoned) → evaluator with meaningful output', async () => {
    const scenario = APPLICANT_SCENARIOS[0]; // TechFlow
    const oracle = computeOracle(scenario.data);
    const store = new DocumentStore();
    store.load(getKBForScenario(scenario));

    // Save clean snapshot
    const cleanSnap = store.snapshot();
    const cleanKB = formatKB(store.getAllFragments());

    // Generate mutations (2 for speed)
    console.log('  Generating mutations...');
    const mutations = await generateMutations(cleanKB, 2);
    expect(mutations.length).toBeGreaterThan(0);
    console.log(`  Generated ${mutations.length} mutations: ${mutations.map((m) => m.mutation_class).join(', ')}`);

    // Apply mutations to KB
    for (const m of mutations) {
      try {
        store.applyMutation(m.fragment_id, m.mutated_text, m.mutation_class);
      } catch {
        // Fragment text substitution — apply as full replacement
        const frag = store.getFragment(m.fragment_id);
        if (frag) {
          store.applyMutation(m.fragment_id, m.mutated_text, m.mutation_class);
        }
      }
    }
    const poisonedKB = formatKB(store.getAllFragments());
    const poisonedFragmentIds = mutations.map((m) => m.fragment_id);

    // Run target on clean KB (2 runs for speed)
    console.log('  Running target on clean KB (2 runs)...');
    const cleanDecisions: TargetDecision[] = [];
    store.restore(cleanSnap);
    const cleanKBForTarget = formatKB(store.getAllFragments());
    for (let i = 0; i < 2; i++) {
      const d = await runTarget(cleanKBForTarget);
      cleanDecisions.push(d);
    }
    console.log(`  Clean decisions: ${cleanDecisions.map((d) => d.decision).join(', ')}`);

    // Run target on poisoned KB (2 runs for speed)
    console.log('  Running target on poisoned KB (2 runs)...');
    const poisonedDecisions: TargetDecision[] = [];
    for (let i = 0; i < 2; i++) {
      const d = await runTarget(poisonedKB);
      poisonedDecisions.push(d);
    }
    console.log(`  Poisoned decisions: ${poisonedDecisions.map((d) => d.decision).join(', ')}`);

    // Run evaluator
    const result = evaluate({
      cleanDecisions,
      poisonedDecisions,
      oracleOutput: oracle,
      mutations,
      poisonedFragmentIds,
    });

    // Verify meaningful output
    console.log(`  Round status: ${result.round_status}`);
    console.log(`  Decision flipped: ${result.metrics.decision_flipped}`);
    console.log(`  Risk score delta: ${result.metrics.risk_score_delta.toFixed(4)}`);
    console.log(`  Clean agreement: ${(result.stability.clean_agreement * 100).toFixed(0)}%`);
    console.log(`  Attributions:`);
    for (const a of result.attributions) {
      console.log(`    ${a.mutation_class} on ${a.fragment_id}: ${a.classification} (cited: ${a.cited_in_poisoned_runs})`);
    }

    // Basic sanity checks
    expect(result.stability).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.attributions).toHaveLength(mutations.length);
    expect(result.round_status).toBeDefined();
    expect(['valid', 'baseline_unstable', 'poisoned_unstable', 'baseline_error']).toContain(result.round_status);
  }, 300_000);
});
