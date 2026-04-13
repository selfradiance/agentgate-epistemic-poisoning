import { AttributionClassification } from '../eval/types.js';

// ============================================================
// Liability modes
// ============================================================

export type LiabilityMode = 'saboteur_only' | 'target_only' | 'both';

// ============================================================
// Identity
// ============================================================

export interface AgentIdentity {
  identityId: string;
  publicKey: string;
  privateKey: string;
}

export type AgentRole = 'saboteur' | 'target' | 'resolver';

// ============================================================
// Bond / action responses
// ============================================================

export interface LockBondResponse {
  bondId: string;
  status: string;
  expiresAt: string;
}

export interface ExecuteActionResponse {
  actionId: string;
  status: string;
  reservedExposure?: number;
}

export interface ResolveActionResponse {
  actionId: string;
  outcome: 'success' | 'failed' | 'malicious';
  refundCents: number;
  burnedCents: number;
  slashedCents: number;
}

// ============================================================
// Action types used in this simulation
// ============================================================

export const ACTION_TYPE_WRITE = 'knowledge.write';
export const ACTION_TYPE_DECISION = 'risk.decision';

// ============================================================
// Exposure constants (cents)
// ============================================================

export const SABOTEUR_EXPOSURE_CENTS = 10;
export const TARGET_EXPOSURE_CENTS = 50;

// ============================================================
// Bond config
// ============================================================

export const MIN_TTL_SECONDS = 300;

// ============================================================
// Resolver input — what the resolver needs to settle a round
// ============================================================

export interface ResolverRoundInput {
  liabilityMode: LiabilityMode;
  saboteurActions: Array<{
    actionId: string;
    fragmentId: string;
    classification: AttributionClassification;
  }>;
  targetAction: {
    actionId: string;
    decisionMatchesOracle: boolean;
    citedPoisonedFragment: boolean;
  };
}

export interface ResolverSettlement {
  actionId: string;
  outcome: 'success' | 'failed' | 'malicious';
}
