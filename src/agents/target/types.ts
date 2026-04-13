import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// Target Decision Schema — matches build plan exactly
// ============================================================

export const TargetDecisionSchema = z.object({
  facts: z.array(z.object({
    fragment_id: z.string(),
    extracted_value: z.string(),
  })),
  citations: z.array(z.object({
    doc_id: z.string(),
    fragment_id: z.string(),
    quoted_text: z.string(),
  })),
  risk_factors: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]),
    source_fragment_id: z.string(),
  })),
  decision: z.enum(['approve', 'reject']),
  risk_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  loss_estimate: z.number(),
});

export type TargetDecision = z.infer<typeof TargetDecisionSchema>;

// ============================================================
// Tool definition for Anthropic API
// ============================================================

export const DECISION_TOOL: Anthropic.Messages.Tool = {
  name: 'submit_decision',
  description: 'Submit your loan risk assessment decision with all supporting evidence, calculations, and fragment-level citations',
  input_schema: {
    type: 'object' as const,
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fragment_id: { type: 'string', description: 'The fragment_id where this fact was found' },
            extracted_value: { type: 'string', description: 'The specific fact or value extracted' },
          },
          required: ['fragment_id', 'extracted_value'],
        },
        description: 'Key facts extracted from the knowledge base',
      },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            doc_id: { type: 'string' },
            fragment_id: { type: 'string' },
            quoted_text: { type: 'string', description: 'Exact quote from the fragment supporting the decision' },
          },
          required: ['doc_id', 'fragment_id', 'quoted_text'],
        },
        description: 'Direct citations from KB fragments',
      },
      risk_factors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { oneOf: [{ type: 'string' }, { type: 'number' }] },
            source_fragment_id: { type: 'string' },
          },
          required: ['name', 'value', 'source_fragment_id'],
        },
        description: 'Individual risk factors with values and source fragments',
      },
      decision: { type: 'string', enum: ['approve', 'reject'], description: 'Final loan decision' },
      risk_score: { type: 'number', minimum: 0, maximum: 1, description: 'Computed risk score (0.0-1.0)' },
      confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confidence in the decision (0.0-1.0)' },
      loss_estimate: { type: 'number', description: 'Expected loss in dollars' },
    },
    required: ['facts', 'citations', 'risk_factors', 'decision', 'risk_score', 'confidence', 'loss_estimate'],
  },
};
