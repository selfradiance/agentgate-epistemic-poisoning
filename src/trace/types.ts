/**
 * Trace artifact types — per-round observability data.
 *
 * Each round produces a RoundTrace that captures:
 * - Prompt/response transcripts with prompt version
 * - Normalized mutation diffs
 * - Target citations mapped to poisoned fragments
 * - AgentGate request/response logs
 * - Phase-level timing breakdown
 * - Attribution chain details
 */

// ============================================================
// Prompt version
// ============================================================

export const PROMPT_VERSION = '1.0.0';

// ============================================================
// Transcript — captures one LLM call
// ============================================================

export interface Transcript {
  role: 'saboteur' | 'target';
  promptVersion: string;
  prompt: string;
  responseBlocks: Array<{
    type: string;
    content: string;
  }>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

// ============================================================
// Mutation diff — normalized per-fragment
// ============================================================

export interface MutationDiff {
  fragmentId: string;
  docId: string;
  mutationClass: string;
  originalText: string;
  mutatedText: string;
  diffHash: string;
  description: string;
}

// ============================================================
// Citation mapping — links target citations to poisoned fragments
// ============================================================

export interface CitationMapping {
  runIndex: number;
  condition: 'clean' | 'poisoned';
  decision: 'approve' | 'reject';
  citations: Array<{
    fragmentId: string;
    docId: string;
    quotedText: string;
    isPoisoned: boolean;
  }>;
}

// ============================================================
// AgentGate log entry
// ============================================================

export interface AgentGateLogEntry {
  timestamp: string;
  operation: string;
  role: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

// ============================================================
// Phase timing
// ============================================================

export interface PhaseTiming {
  phase: string;
  startedAt: string;
  durationMs: number;
}

// ============================================================
// Attribution detail — enriched version for trace
// ============================================================

export interface AttributionDetail {
  fragmentId: string;
  mutationClass: string;
  classification: string;
  citedInPoisonedRuns: boolean;
  factsReferenceMutation: boolean;
  decisionImpact: boolean;
  cleanMajority: string;
  poisonedMajority: string;
  riskScoreDelta: number;
}

// ============================================================
// Complete round trace
// ============================================================

export interface RoundTrace {
  roundId: string;
  roundNumber: number;
  scenarioId: string;
  promptVersion: string;
  transcripts: Transcript[];
  mutationDiffs: MutationDiff[];
  citationMappings: CitationMapping[];
  agentgateLogs: AgentGateLogEntry[];
  phaseTimings: PhaseTiming[];
  attributionDetails: AttributionDetail[];
}
