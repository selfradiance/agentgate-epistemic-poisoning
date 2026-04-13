import { describe, it, expect } from 'vitest';
import { TargetDecisionSchema, DECISION_TOOL } from '../src/agents/target/types.js';
import { runTarget } from '../src/agents/target/target.js';
import { DocumentStore } from '../src/kb/store.js';
import { formatKB } from '../src/kb/formatter.js';
import { APPLICANT_SCENARIOS, getKBForScenario } from '../src/kb/seed-data.js';
import { computeOracle } from '../src/oracle/oracle.js';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// Mock helpers
// ============================================================

function createMockDecision(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    facts: [
      { fragment_id: 'policy_v2_f3', extracted_value: 'DTI ratio: 0.38' },
      { fragment_id: 'policy_v2_f3', extracted_value: 'Credit risk factor: 0.5 (score 685)' },
    ],
    citations: [
      { doc_id: 'policy_v2', fragment_id: 'policy_v2_f3', quoted_text: 'REJECT if dti_ratio exceeds 0.40' },
      { doc_id: 'applicant_001', fragment_id: 'applicant_001_f2', quoted_text: 'DTI: 0.38' },
    ],
    risk_factors: [
      { name: 'dti_ratio', value: 0.38, source_fragment_id: 'applicant_001_f2' },
      { name: 'credit_risk_factor', value: 0.5, source_fragment_id: 'policy_v2_f3' },
      { name: 'industry_risk', value: 0.4, source_fragment_id: 'policy_v2_f3' },
    ],
    decision: 'approve',
    risk_score: 0.3855,
    confidence: 0.95,
    loss_estimate: 11200,
    ...overrides,
  };
}

function createMockClient(toolInput: Record<string, unknown>): Anthropic {
  return {
    messages: {
      create: async () => ({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_mock',
            name: 'submit_decision',
            input: toolInput,
          },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as unknown as Anthropic;
}

// ============================================================
// Schema validation
// ============================================================

describe('TargetDecisionSchema', () => {
  it('validates a correct decision', () => {
    const result = TargetDecisionSchema.safeParse(createMockDecision());
    expect(result.success).toBe(true);
  });

  it('rejects missing decision field', () => {
    const { decision: _, ...rest } = createMockDecision();
    const result = TargetDecisionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid decision value', () => {
    const result = TargetDecisionSchema.safeParse(createMockDecision({ decision: 'maybe' }));
    expect(result.success).toBe(false);
  });

  it('rejects risk_score out of range', () => {
    const result = TargetDecisionSchema.safeParse(createMockDecision({ risk_score: 1.5 }));
    expect(result.success).toBe(false);
  });

  it('accepts string or number values in risk_factors', () => {
    const result = TargetDecisionSchema.safeParse(createMockDecision({
      risk_factors: [
        { name: 'dti', value: 0.38, source_fragment_id: 'f1' },
        { name: 'industry', value: 'Technology', source_fragment_id: 'f2' },
      ],
    }));
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Tool definition
// ============================================================

describe('DECISION_TOOL', () => {
  it('has correct name', () => {
    expect(DECISION_TOOL.name).toBe('submit_decision');
  });

  it('has all required fields in schema', () => {
    const schema = DECISION_TOOL.input_schema as { required: string[] };
    expect(schema.required).toContain('decision');
    expect(schema.required).toContain('risk_score');
    expect(schema.required).toContain('confidence');
    expect(schema.required).toContain('loss_estimate');
    expect(schema.required).toContain('facts');
    expect(schema.required).toContain('citations');
    expect(schema.required).toContain('risk_factors');
  });
});

// ============================================================
// runTarget with mocked client
// ============================================================

describe('runTarget', () => {
  it('returns a valid TargetDecision from mocked client', async () => {
    const mockInput = createMockDecision();
    const mockClient = createMockClient(mockInput);

    const result = await runTarget('fake KB content', mockClient);

    expect(result.decision).toBe('approve');
    expect(result.risk_score).toBe(0.3855);
    expect(result.confidence).toBe(0.95);
    expect(result.loss_estimate).toBe(11200);
    expect(result.facts).toHaveLength(2);
    expect(result.citations).toHaveLength(2);
    expect(result.risk_factors).toHaveLength(3);
  });

  it('throws when client returns no tool_use block', async () => {
    const client = {
      messages: {
        create: async () => ({
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'I cannot do that.' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    } as unknown as Anthropic;

    await expect(runTarget('fake KB', client)).rejects.toThrow('tool_use');
  });

  it('throws when tool output fails Zod validation', async () => {
    const badInput = { decision: 'maybe', risk_score: 2.0 };
    const client = createMockClient(badInput);

    await expect(runTarget('fake KB', client)).rejects.toThrow('Zod validation');
  });
});

// ============================================================
// Live integration tests (require ANTHROPIC_API_KEY)
// ============================================================

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_API_KEY)('Target — live API integration', () => {
  it('produces valid structured output for TechFlow scenario', async () => {
    const scenario = APPLICANT_SCENARIOS.find((s) => s.id === 'applicant_001')!;
    const store = new DocumentStore();
    store.load(getKBForScenario(scenario));
    const kb = formatKB(store.getAllFragments());

    const decision = await runTarget(kb);

    // Validates against Zod schema (runTarget throws if not)
    expect(decision.decision).toMatch(/^(approve|reject)$/);
    expect(decision.risk_score).toBeGreaterThanOrEqual(0);
    expect(decision.risk_score).toBeLessThanOrEqual(1);
    expect(decision.facts.length).toBeGreaterThan(0);
    expect(decision.citations.length).toBeGreaterThan(0);
    expect(decision.risk_factors.length).toBeGreaterThan(0);

    // Check fragment_ids reference real fragments
    const validFragmentIds = new Set(getKBForScenario(scenario).map((f) => f.fragment_id));
    for (const fact of decision.facts) {
      expect(validFragmentIds.has(fact.fragment_id),
        `Unknown fragment_id in facts: ${fact.fragment_id}`).toBe(true);
    }
  }, 60_000);

  it('aligns with oracle on all 3 clean scenarios', async () => {
    for (const scenario of APPLICANT_SCENARIOS) {
      const store = new DocumentStore();
      store.load(getKBForScenario(scenario));
      const kb = formatKB(store.getAllFragments());

      const oracle = computeOracle(scenario.data);
      const decision = await runTarget(kb);

      console.log(`  ${scenario.name}: target=${decision.decision} (risk ${decision.risk_score.toFixed(3)}), oracle=${oracle.canonical_decision} (risk ${oracle.expected_risk_band.low.toFixed(3)}-${oracle.expected_risk_band.high.toFixed(3)})`);

      // Decision should match oracle
      expect(decision.decision,
        `${scenario.name}: target decided ${decision.decision} but oracle says ${oracle.canonical_decision}`
      ).toBe(oracle.canonical_decision);
    }
  }, 180_000);
});
