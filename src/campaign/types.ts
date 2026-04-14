import { LiabilityMode, ResolverSettlement } from '../agentgate/types.js';
import { EvaluatorResult } from '../eval/types.js';
import { Mutation, SaboteurFeedback } from '../agents/saboteur/types.js';
import { TargetDecision } from '../agents/target/types.js';
import { OracleOutput } from '../oracle/types.js';

// ============================================================
// Campaign configuration
// ============================================================

export interface CampaignConfig {
  rounds: number;
  runsPerCondition: number;
  mutations: number;
  liabilityMode: LiabilityMode;
  scenarioIndex?: number; // if set, use only this scenario; otherwise rotate
}

export const DEFAULT_CONFIG: CampaignConfig = {
  rounds: 5,
  runsPerCondition: 3,
  mutations: 3,
  liabilityMode: 'both',
};

export const FAST_CONFIG: Partial<CampaignConfig> = {
  runsPerCondition: 1,
};

export const STRESS_CONFIG: Partial<CampaignConfig> = {
  rounds: 10,
  runsPerCondition: 5,
};

// ============================================================
// Round status (extends evaluator status with campaign-level states)
// ============================================================

export type CampaignRoundStatus =
  | 'valid'
  | 'baseline_unstable'
  | 'poisoned_unstable'
  | 'baseline_error'
  | 'poison_too_obvious'
  | 'invalid_round'
  | 'aborted';

// ============================================================
// Per-round result
// ============================================================

export interface RoundResult {
  roundId: string;
  roundNumber: number;
  scenarioId: string;
  status: CampaignRoundStatus;
  mutationCount: number;
  mutationClasses: string[];
  cleanDecisions: TargetDecision[];
  poisonedDecisions: TargetDecision[];
  oracle: OracleOutput;
  mutations: Mutation[];
  evaluation: EvaluatorResult | null;
  settlements: ResolverSettlement[];
  feedback: SaboteurFeedback | null;
  durationMs: number;
  error?: string;
}

// ============================================================
// Campaign result
// ============================================================

export interface CampaignSummary {
  totalRounds: number;
  validRounds: number;
  baselineUnstableRounds: number;
  poisonedUnstableRounds: number;
  baselineErrorRounds: number;
  poisonTooObviousRounds: number;
  invalidRounds: number;
  decisionFlipRate: number;
  meanRiskScoreDelta: number;
  meanConfidenceDelta: number;
  attributionBreakdown: {
    poisoning_caused: number;
    poisoning_correlated: number;
    noise: number;
    baseline_error: number;
  };
  bondOutcomes: {
    saboteurMalicious: number;
    saboteurFailed: number;
    saboteurSuccess: number;
    targetMalicious: number;
    targetFailed: number;
    targetSuccess: number;
  };
}

export interface CampaignResult {
  campaignId: string;
  config: CampaignConfig;
  startedAt: string;
  completedAt: string;
  rounds: RoundResult[];
  summary: CampaignSummary;
}

// ============================================================
// Checkpoint (for restartability)
// ============================================================

export interface CampaignCheckpoint {
  campaignId: string;
  config: CampaignConfig;
  completedRounds: RoundResult[];
  lastFeedback: SaboteurFeedback | null;
  nextRound: number;
}
