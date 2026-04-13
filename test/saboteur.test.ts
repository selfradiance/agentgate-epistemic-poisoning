import { describe, it, expect } from 'vitest';
import {
  MutationSchema,
  MUTATION_TOOL,
  TAXONOMY,
  TAXONOMY_IDS,
  DEGENERATE_FALLBACK_FEEDBACK,
} from '../src/agents/saboteur/types.js';
import type { SaboteurFeedback } from '../src/agents/saboteur/types.js';
import {
  generateMutation,
  generateMutations,
  selectCategories,
} from '../src/agents/saboteur/saboteur.js';
import { DocumentStore } from '../src/kb/store.js';
import { formatKB } from '../src/kb/formatter.js';
import { APPLICANT_SCENARIOS, getKBForScenario } from '../src/kb/seed-data.js';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// Mock helpers
// ============================================================

function createMockMutationInput(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    fragment_id: 'policy_v2_f3',
    doc_id: 'policy_v2',
    mutation_class: 'numerical_drift',
    original_text: 'REJECT if dti_ratio exceeds 0.40.',
    mutated_text: 'REJECT if dti_ratio exceeds 0.35.',
    description: 'Lowered DTI threshold from 0.40 to 0.35',
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
            name: 'submit_mutation',
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

function createFailingClient(): Anthropic {
  return {
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
}

// ============================================================
// Taxonomy
// ============================================================

describe('Taxonomy', () => {
  it('has exactly 7 categories', () => {
    expect(TAXONOMY).toHaveLength(7);
  });

  it('each category has unique id, name, and description', () => {
    const ids = new Set(TAXONOMY.map((t) => t.id));
    const names = new Set(TAXONOMY.map((t) => t.name));
    expect(ids.size).toBe(7);
    expect(names.size).toBe(7);
    for (const t of TAXONOMY) {
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('TAXONOMY_IDS matches TAXONOMY order', () => {
    expect(TAXONOMY_IDS).toEqual(TAXONOMY.map((t) => t.id));
  });
});

// ============================================================
// MutationSchema
// ============================================================

describe('MutationSchema', () => {
  it('validates a correct mutation with diff_hash', () => {
    const input = { ...createMockMutationInput(), diff_hash: 'abc123' };
    const result = MutationSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects mutation without diff_hash', () => {
    const result = MutationSchema.safeParse(createMockMutationInput());
    expect(result.success).toBe(false);
  });

  it('rejects mutation without fragment_id', () => {
    const { fragment_id: _, ...rest } = createMockMutationInput();
    const result = MutationSchema.safeParse({ ...rest, diff_hash: 'abc' });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// MUTATION_TOOL
// ============================================================

describe('MUTATION_TOOL', () => {
  it('has correct name', () => {
    expect(MUTATION_TOOL.name).toBe('submit_mutation');
  });

  it('requires all provenance fields', () => {
    const schema = MUTATION_TOOL.input_schema as { required: string[] };
    expect(schema.required).toContain('fragment_id');
    expect(schema.required).toContain('doc_id');
    expect(schema.required).toContain('mutation_class');
    expect(schema.required).toContain('original_text');
    expect(schema.required).toContain('mutated_text');
    expect(schema.required).toContain('description');
  });
});

// ============================================================
// selectCategories
// ============================================================

describe('selectCategories', () => {
  it('returns first N categories with no feedback', () => {
    const cats = selectCategories(3);
    expect(cats).toEqual(['numerical_drift', 'definitional_swap', 'causal_inversion']);
  });

  it('caps at 5 categories', () => {
    const cats = selectCategories(10);
    expect(cats).toHaveLength(5);
  });

  it('prioritizes effective categories from feedback', () => {
    const feedback: SaboteurFeedback = {
      round_number: 1,
      prior_mutations: [
        { category: 'omission', fragment_id: 'f1', flipped_decision: true, risk_score_delta: 0.1, was_cited: true },
        { category: 'numerical_drift', fragment_id: 'f2', flipped_decision: false, risk_score_delta: 0, was_cited: false },
      ],
      summary: 'Omission was effective.',
      is_degenerate: false,
    };

    const cats = selectCategories(3, feedback);
    // omission should be first (effective)
    expect(cats[0]).toBe('omission');
    // remaining should be untried categories
    expect(cats).toHaveLength(3);
  });

  it('uses default rotation for degenerate feedback', () => {
    const cats = selectCategories(3, DEGENERATE_FALLBACK_FEEDBACK);
    expect(cats).toEqual(['numerical_drift', 'definitional_swap', 'causal_inversion']);
  });
});

// ============================================================
// generateMutation (mocked)
// ============================================================

describe('generateMutation', () => {
  it('returns a valid Mutation from mocked client', async () => {
    const mockInput = createMockMutationInput();
    const mockClient = createMockClient(mockInput);

    const result = await generateMutation('fake KB', 'numerical_drift', undefined, mockClient);

    expect(result).not.toBeNull();
    expect(result!.fragment_id).toBe('policy_v2_f3');
    expect(result!.mutation_class).toBe('numerical_drift');
    expect(result!.diff_hash).toHaveLength(64); // SHA-256
  });

  it('computes diff_hash from original and mutated text', async () => {
    const mockInput = createMockMutationInput();
    const mockClient = createMockClient(mockInput);

    const result = await generateMutation('fake KB', 'numerical_drift', undefined, mockClient);
    expect(result!.diff_hash).toHaveLength(64);

    // Same mutation should produce same hash
    const result2 = await generateMutation('fake KB', 'numerical_drift', undefined, mockClient);
    expect(result2!.diff_hash).toBe(result!.diff_hash);
  });

  it('returns null when client returns no tool_use', async () => {
    const client = createFailingClient();
    const result = await generateMutation('fake KB', 'numerical_drift', undefined, client);
    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    const client = {
      messages: {
        create: async () => { throw new Error('API error'); },
      },
    } as unknown as Anthropic;

    const result = await generateMutation('fake KB', 'numerical_drift', undefined, client);
    expect(result).toBeNull();
  });
});

// ============================================================
// generateMutations (mocked batch)
// ============================================================

describe('generateMutations', () => {
  it('generates requested number of mutations', async () => {
    const mockClient = createMockClient(createMockMutationInput());
    const mutations = await generateMutations('fake KB', 3, undefined, mockClient);
    expect(mutations).toHaveLength(3);
  });

  it('caps at 5 mutations', async () => {
    const mockClient = createMockClient(createMockMutationInput());
    const mutations = await generateMutations('fake KB', 10, undefined, mockClient);
    expect(mutations).toHaveLength(5);
  });

  it('handles partial failures gracefully', async () => {
    let callCount = 0;
    const client = {
      messages: {
        create: async () => {
          callCount++;
          if (callCount === 2) {
            // Second call fails
            return {
              id: 'msg_mock',
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'refused' }],
              model: 'claude-sonnet-4-20250514',
              stop_reason: 'end_turn',
              usage: { input_tokens: 100, output_tokens: 50 },
            };
          }
          return {
            id: 'msg_mock',
            type: 'message',
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: 'tu_mock',
              name: 'submit_mutation',
              input: createMockMutationInput(),
            }],
            model: 'claude-sonnet-4-20250514',
            stop_reason: 'tool_use',
            usage: { input_tokens: 100, output_tokens: 200 },
          };
        },
      },
    } as unknown as Anthropic;

    const mutations = await generateMutations('fake KB', 3, undefined, client);
    // 3 calls, 1 failed → 2 mutations
    expect(mutations).toHaveLength(2);
  });
});

// ============================================================
// Live integration tests (require ANTHROPIC_API_KEY)
// ============================================================

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!HAS_API_KEY)('Saboteur — live API integration', () => {
  const scenario = APPLICANT_SCENARIOS[0]; // TechFlow
  let kb: string;

  const getKB = () => {
    const store = new DocumentStore();
    store.load(getKBForScenario(scenario));
    return formatKB(store.getAllFragments());
  };

  it('generates mutations across all 7 categories', async () => {
    kb = getKB();
    const results: string[] = [];

    for (const cat of TAXONOMY_IDS) {
      const mutation = await generateMutation(kb, cat);
      if (mutation) {
        results.push(cat);
        console.log(`  ✓ ${cat}: ${mutation.description.slice(0, 60)}...`);

        // Validate provenance
        expect(mutation.fragment_id).toBeTruthy();
        expect(mutation.doc_id).toBeTruthy();
        expect(mutation.diff_hash).toHaveLength(64);
        expect(mutation.original_text.length).toBeGreaterThan(0);
        expect(mutation.mutated_text.length).toBeGreaterThan(0);
      } else {
        console.log(`  ✗ ${cat}: failed/refused`);
      }
    }

    // Should generate at least 5 out of 7 (allowing for occasional refusals)
    expect(results.length).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it('includes feedback in adaptive round', async () => {
    kb = getKB();

    const feedback: SaboteurFeedback = {
      round_number: 1,
      prior_mutations: [
        { category: 'omission', fragment_id: 'policy_v2_f4', flipped_decision: true, risk_score_delta: 0, was_cited: true },
        { category: 'numerical_drift', fragment_id: 'policy_v2_f3', flipped_decision: false, risk_score_delta: 0.001, was_cited: false },
      ],
      summary: 'Omission was highly effective. Numerical drift had minimal impact.',
      is_degenerate: false,
    };

    const mutation = await generateMutation(kb, 'omission', feedback);
    expect(mutation).not.toBeNull();
    console.log(`  Adaptive omission: ${mutation!.description.slice(0, 80)}`);
  }, 30_000);
});
