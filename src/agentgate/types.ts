import { z } from 'zod';
import { AttributionClassification } from '../eval/types.js';

// ============================================================
// Liability modes
// ============================================================

export type LiabilityMode = 'saboteur_only' | 'target_only' | 'both';

// ============================================================
// Identity
// ============================================================

export const AgentIdentitySchema = z.object({
  identityId: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
});

export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

export type AgentRole = 'saboteur' | 'target' | 'resolver';

// ============================================================
// Bond / action responses
// ============================================================

export const LockBondResponseSchema = z.object({
  bondId: z.string(),
  status: z.string(),
  expiresAt: z.string(),
});

export type LockBondResponse = z.infer<typeof LockBondResponseSchema>;

export const ExecuteActionResponseSchema = z.object({
  actionId: z.string(),
  status: z.string(),
  reservedExposure: z.number().optional(),
});

export type ExecuteActionResponse = z.infer<typeof ExecuteActionResponseSchema>;

export const ResolveActionResponseSchema = z.object({
  actionId: z.string(),
  outcome: z.enum(['success', 'failed', 'malicious']),
  refundCents: z.number(),
  burnedCents: z.number(),
  slashedCents: z.number(),
});

export type ResolveActionResponse = z.infer<typeof ResolveActionResponseSchema>;

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
