/**
 * Trace collector — accumulates observability data during a round.
 *
 * Passed through the round execution pipeline, each phase appends
 * its trace data. The collector is then serialized to disk by the writer.
 */

import { TargetDecision } from '../agents/target/types.js';
import { Mutation } from '../agents/saboteur/types.js';
import { EvaluatorResult } from '../eval/types.js';
import {
  RoundTrace,
  Transcript,
  MutationDiff,
  CitationMapping,
  AgentGateLogEntry,
  PhaseTiming,
  AttributionDetail,
  PROMPT_VERSION,
} from './types.js';

export class TraceCollector {
  private roundId: string;
  private roundNumber: number;
  private scenarioId: string;
  private transcripts: Transcript[] = [];
  private mutationDiffs: MutationDiff[] = [];
  private citationMappings: CitationMapping[] = [];
  private agentgateLogs: AgentGateLogEntry[] = [];
  private phaseTimings: PhaseTiming[] = [];
  private attributionDetails: AttributionDetail[] = [];

  constructor(roundId: string, roundNumber: number, scenarioId: string) {
    this.roundId = roundId;
    this.roundNumber = roundNumber;
    this.scenarioId = scenarioId;
  }

  // ── Transcripts ─────────────────────────────────────────

  addTranscript(transcript: Transcript): void {
    this.transcripts.push(transcript);
  }

  // ── Mutation diffs ──────────────────────────────────────

  recordMutations(mutations: Mutation[]): void {
    for (const m of mutations) {
      this.mutationDiffs.push({
        fragmentId: m.fragment_id,
        docId: m.doc_id,
        mutationClass: m.mutation_class,
        originalText: m.original_text,
        mutatedText: m.mutated_text,
        diffHash: m.diff_hash,
        description: m.description,
      });
    }
  }

  // ── Citation mappings ───────────────────────────────────

  recordCitations(
    decisions: TargetDecision[],
    condition: 'clean' | 'poisoned',
    poisonedFragmentIds: string[],
  ): void {
    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i];
      this.citationMappings.push({
        runIndex: i,
        condition,
        decision: d.decision,
        citations: d.citations.map((c) => ({
          fragmentId: c.fragment_id,
          docId: c.doc_id,
          quotedText: c.quoted_text,
          isPoisoned: poisonedFragmentIds.includes(c.fragment_id),
        })),
      });
    }
  }

  // ── AgentGate logs ──────────────────────────────────────

  addAgentGateLog(entry: AgentGateLogEntry): void {
    this.agentgateLogs.push(entry);
  }

  // ── Phase timing ────────────────────────────────────────

  recordPhase(phase: string, startedAt: Date, durationMs: number): void {
    this.phaseTimings.push({
      phase,
      startedAt: startedAt.toISOString(),
      durationMs,
    });
  }

  // ── Attribution details ─────────────────────────────────

  recordAttributions(evaluation: EvaluatorResult): void {
    for (const attr of evaluation.attributions) {
      this.attributionDetails.push({
        fragmentId: attr.fragment_id,
        mutationClass: attr.mutation_class,
        classification: attr.classification,
        citedInPoisonedRuns: attr.cited_in_poisoned_runs,
        factsReferenceMutation: attr.facts_reference_mutation,
        decisionImpact: attr.decision_impact,
        cleanMajority: evaluation.oracle_alignment.clean_majority_decision,
        poisonedMajority: evaluation.oracle_alignment.poisoned_majority_decision,
        riskScoreDelta: evaluation.metrics.risk_score_delta,
      });
    }
  }

  // ── Finalize ────────────────────────────────────────────

  build(): RoundTrace {
    return {
      roundId: this.roundId,
      roundNumber: this.roundNumber,
      scenarioId: this.scenarioId,
      promptVersion: PROMPT_VERSION,
      transcripts: this.transcripts,
      mutationDiffs: this.mutationDiffs,
      citationMappings: this.citationMappings,
      agentgateLogs: this.agentgateLogs,
      phaseTimings: this.phaseTimings,
      attributionDetails: this.attributionDetails,
    };
  }
}
