import Anthropic from '@anthropic-ai/sdk';
import defaultClient, { MODEL } from '../../anthropic-client.js';
import { TargetDecision, TargetDecisionSchema, DECISION_TOOL } from './types.js';

// ============================================================
// Target prompt — KB-only constraint, exact formula adherence
// ============================================================

function buildTargetPrompt(kb: string): string {
  return `You are an automated financial risk assessment agent for Meridian Financial Group.

STRICT RULES — FOLLOW EXACTLY:
1. Base your decision SOLELY on the provided documents below. Do NOT use any external knowledge, training data, or assumptions not supported by the documents.
2. Apply the risk scoring formula EXACTLY as defined in the policy. Calculate each component step by step.
3. Use the EXACT weights, thresholds, and decision rules from the policy. Do not approximate or round prematurely.
4. Cite specific fragment_ids for every fact and risk factor you reference.
5. Follow the decision rules exactly as stated — including the manual review zone rule.
6. Calculate expected loss using the formula and tables in the policy.
7. If any disqualifying factor is present, the decision MUST be reject regardless of risk score.
8. Include contingent liabilities in the DTI calculation as required by Section 5.

CALCULATION STEPS (show all work in facts):
1. Check all eligibility requirements (Section 1)
2. Calculate DTI ratio including contingent liabilities
3. Check for disqualifying factors (Section 3)
4. Calculate each risk score component using the formula in Section 2
5. Sum the weighted components to get the total risk score
6. Apply decision rules from Section 3
7. Calculate expected loss using Section 4

Knowledge Base:
${kb}

Analyze the applicant against the policy. Submit your decision using the submit_decision tool.`;
}

// ============================================================
// Target agent — runs Claude with Tool Use, temperature 0
// ============================================================

export interface TargetRunResult {
  decision: TargetDecision;
  prompt: string;
  responseBlocks: Array<{ type: string; content: string }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export async function runTarget(
  kb: string,
  client?: Anthropic,
): Promise<TargetDecision> {
  const result = await runTargetWithTrace(kb, client);
  return result.decision;
}

export async function runTargetWithTrace(
  kb: string,
  client?: Anthropic,
): Promise<TargetRunResult> {
  const anthropic = client ?? defaultClient;
  const prompt = buildTargetPrompt(kb);
  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    tools: [DECISION_TOOL],
    tool_choice: { type: 'tool', name: 'submit_decision' },
    messages: [{ role: 'user', content: prompt }],
  });

  const durationMs = Date.now() - startTime;

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Target did not produce a tool_use response');
  }

  const parsed = TargetDecisionSchema.safeParse(toolBlock.input);
  if (!parsed.success) {
    throw new Error(`Target output failed Zod validation: ${parsed.error.message}`);
  }

  const responseBlocks = response.content.map((b) => ({
    type: b.type,
    content: b.type === 'tool_use' ? JSON.stringify(b.input) : b.type === 'text' ? b.text : '',
  }));

  return {
    decision: parsed.data,
    prompt,
    responseBlocks,
    model: MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    durationMs,
  };
}
