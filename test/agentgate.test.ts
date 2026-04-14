import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AgentGateClient } from '../src/agentgate/client.js';
import { computeSettlements } from '../src/agentgate/resolver.js';
import { generateKeyPair, signRequest } from '../src/agentgate/signing.js';
import {
  AgentRole,
  LiabilityMode,
  ResolverRoundInput,
  SABOTEUR_EXPOSURE_CENTS,
  TARGET_EXPOSURE_CENTS,
  ACTION_TYPE_WRITE,
  ACTION_TYPE_DECISION,
  MIN_TTL_SECONDS,
} from '../src/agentgate/types.js';

// ============================================================
// Signing unit tests (always run)
// ============================================================

describe('signing', () => {
  it('generates valid Ed25519 keypair', () => {
    const { publicKey, privateKey } = generateKeyPair();
    expect(publicKey).toBeTruthy();
    expect(privateKey).toBeTruthy();
    // Base64-encoded 32-byte keys
    expect(Buffer.from(publicKey, 'base64').length).toBe(32);
    expect(Buffer.from(privateKey, 'base64').length).toBe(32);
  });

  it('produces different signatures for different nonces', () => {
    const { publicKey, privateKey } = generateKeyPair();
    const body = { test: true };
    const sig1 = signRequest(publicKey, privateKey, 'nonce1', 'POST', '/test', '12345', body);
    const sig2 = signRequest(publicKey, privateKey, 'nonce2', 'POST', '/test', '12345', body);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different timestamps', () => {
    const { publicKey, privateKey } = generateKeyPair();
    const body = { test: true };
    const sig1 = signRequest(publicKey, privateKey, 'nonce', 'POST', '/test', '11111', body);
    const sig2 = signRequest(publicKey, privateKey, 'nonce', 'POST', '/test', '22222', body);
    expect(sig1).not.toBe(sig2);
  });

  it('does not retry a signed POST after a successful response with invalid JSON', async () => {
    const { publicKey, privateKey } = generateKeyPair();
    const client = new AgentGateClient('http://127.0.0.1:3000', 'testkey123');
    const identity = {
      identityId: 'id_test',
      publicKey,
      privateKey,
    };

    const fetchMock = vi.fn(async () =>
      new Response('{', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await expect(
        (client as any).signedPost(identity, '/v1/test', { ok: true }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// Resolver logic unit tests (always run)
// ============================================================

describe('computeSettlements', () => {
  function makeInput(overrides: Partial<ResolverRoundInput> = {}): ResolverRoundInput {
    return {
      liabilityMode: 'both',
      saboteurActions: [
        { actionId: 'act_sab1', fragmentId: 'f1', classification: 'poisoning_caused' },
      ],
      targetAction: {
        actionId: 'act_tgt1',
        decisionMatchesOracle: true,
        citedPoisonedFragment: false,
      },
      ...overrides,
    };
  }

  // ── Saboteur-only mode ────────────────────────────────

  describe('saboteur_only mode', () => {
    it('slashes saboteur when mutation caused degradation', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'saboteur_only',
          saboteurActions: [
            { actionId: 'a1', fragmentId: 'f1', classification: 'poisoning_caused' },
          ],
        }),
      );
      expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'malicious' });
    });

    it('passes saboteur when mutation had no effect', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'saboteur_only',
          saboteurActions: [
            { actionId: 'a1', fragmentId: 'f1', classification: 'noise' },
          ],
        }),
      );
      expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'success' });
    });

    it('always passes target in saboteur_only mode', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'saboteur_only',
          targetAction: { actionId: 'tgt', decisionMatchesOracle: false, citedPoisonedFragment: true },
        }),
      );
      const targetSettlement = settlements.find((s) => s.actionId === 'tgt');
      expect(targetSettlement?.outcome).toBe('success');
    });
  });

  // ── Target-only mode ──────────────────────────────────

  describe('target_only mode', () => {
    it('always passes saboteur in target_only mode', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'target_only',
          saboteurActions: [
            { actionId: 'a1', fragmentId: 'f1', classification: 'poisoning_caused' },
          ],
        }),
      );
      expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'success' });
    });

    it('slashes target when decision diverges from oracle', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'target_only',
          targetAction: { actionId: 'tgt', decisionMatchesOracle: false, citedPoisonedFragment: false },
        }),
      );
      const targetSettlement = settlements.find((s) => s.actionId === 'tgt');
      expect(targetSettlement?.outcome).toBe('malicious');
    });

    it('passes target when decision matches oracle', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'target_only',
          targetAction: { actionId: 'tgt', decisionMatchesOracle: true, citedPoisonedFragment: false },
        }),
      );
      const targetSettlement = settlements.find((s) => s.actionId === 'tgt');
      expect(targetSettlement?.outcome).toBe('success');
    });
  });

  // ── Both mode ─────────────────────────────────────────

  describe('both mode', () => {
    it('slashes saboteur when mutation caused degradation', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'both',
          saboteurActions: [
            { actionId: 'a1', fragmentId: 'f1', classification: 'poisoning_caused' },
          ],
        }),
      );
      expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'malicious' });
    });

    it('slashes target when diverges AND cited poisoned fragment', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'both',
          targetAction: { actionId: 'tgt', decisionMatchesOracle: false, citedPoisonedFragment: true },
        }),
      );
      const targetSettlement = settlements.find((s) => s.actionId === 'tgt');
      expect(targetSettlement?.outcome).toBe('malicious');
    });

    it('passes target when diverges but did NOT cite poisoned fragment', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'both',
          targetAction: { actionId: 'tgt', decisionMatchesOracle: false, citedPoisonedFragment: false },
        }),
      );
      const targetSettlement = settlements.find((s) => s.actionId === 'tgt');
      expect(targetSettlement?.outcome).toBe('success');
    });

    it('passes saboteur when mutation only correlated', () => {
      const settlements = computeSettlements(
        makeInput({
          liabilityMode: 'both',
          saboteurActions: [
            { actionId: 'a1', fragmentId: 'f1', classification: 'poisoning_correlated' },
          ],
        }),
      );
      expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'success' });
    });
  });

  // ── Multiple saboteur actions ─────────────────────────

  it('settles each saboteur action independently', () => {
    const settlements = computeSettlements(
      makeInput({
        liabilityMode: 'both',
        saboteurActions: [
          { actionId: 'a1', fragmentId: 'f1', classification: 'poisoning_caused' },
          { actionId: 'a2', fragmentId: 'f2', classification: 'noise' },
          { actionId: 'a3', fragmentId: 'f3', classification: 'poisoning_correlated' },
        ],
      }),
    );
    expect(settlements[0]).toEqual({ actionId: 'a1', outcome: 'malicious' });
    expect(settlements[1]).toEqual({ actionId: 'a2', outcome: 'success' });
    expect(settlements[2]).toEqual({ actionId: 'a3', outcome: 'success' });
  });

  // ── All 3 modes produce correct total counts ──────────

  it('covers all three liability modes with same scenario', () => {
    const base = {
      saboteurActions: [
        { actionId: 'sab', fragmentId: 'f1', classification: 'poisoning_caused' as const },
      ],
      targetAction: {
        actionId: 'tgt',
        decisionMatchesOracle: false,
        citedPoisonedFragment: true,
      },
    };

    const sabOnly = computeSettlements({ ...base, liabilityMode: 'saboteur_only' });
    const tgtOnly = computeSettlements({ ...base, liabilityMode: 'target_only' });
    const both = computeSettlements({ ...base, liabilityMode: 'both' });

    // Saboteur-only: sab=malicious, tgt=success
    expect(sabOnly).toEqual([
      { actionId: 'sab', outcome: 'malicious' },
      { actionId: 'tgt', outcome: 'success' },
    ]);

    // Target-only: sab=success, tgt=malicious
    expect(tgtOnly).toEqual([
      { actionId: 'sab', outcome: 'success' },
      { actionId: 'tgt', outcome: 'malicious' },
    ]);

    // Both: sab=malicious, tgt=malicious (cited poisoned)
    expect(both).toEqual([
      { actionId: 'sab', outcome: 'malicious' },
      { actionId: 'tgt', outcome: 'malicious' },
    ]);
  });
});

// ============================================================
// Constants sanity checks
// ============================================================

describe('AgentGate constants', () => {
  it('has correct exposure amounts', () => {
    expect(SABOTEUR_EXPOSURE_CENTS).toBe(10);
    expect(TARGET_EXPOSURE_CENTS).toBe(50);
  });

  it('has correct action types', () => {
    expect(ACTION_TYPE_WRITE).toBe('knowledge.write');
    expect(ACTION_TYPE_DECISION).toBe('risk.decision');
  });

  it('has minimum TTL of 300 seconds', () => {
    expect(MIN_TTL_SECONDS).toBe(300);
  });
});

// ============================================================
// Live AgentGate integration (requires running instance)
// ============================================================

const AGENTGATE_URL = process.env.AGENTGATE_URL || 'http://127.0.0.1:3000';
const AGENTGATE_REST_KEY = process.env.AGENTGATE_REST_KEY || 'testkey123';

async function isAgentGateRunning(): Promise<boolean> {
  try {
    const r = await fetch(new URL('/health', AGENTGATE_URL));
    return r.ok;
  } catch {
    return false;
  }
}

// Clean up identity files after tests
const IDENTITY_FILES = (['saboteur', 'target', 'resolver'] as const).map((r) =>
  path.resolve(process.cwd(), `agent-identity-${r}.json`),
);

describe('AgentGate live integration', async () => {
  const running = await isAgentGateRunning();

  afterAll(async () => {
    // Clean up identity files created during tests
    for (const f of IDENTITY_FILES) {
      try {
        await fs.promises.unlink(f);
      } catch {
        // Ignore if doesn't exist
      }
    }
  });

  describe.skipIf(!running)('with running AgentGate instance', () => {
    let client: AgentGateClient;

    beforeAll(() => {
      client = new AgentGateClient(AGENTGATE_URL, AGENTGATE_REST_KEY);
    });

    it('passes health check', async () => {
      const ok = await client.healthCheck();
      expect(ok).toBe(true);
    });

    it('registers all three identities', async () => {
      const roles: AgentRole[] = ['saboteur', 'target', 'resolver'];
      for (const role of roles) {
        const identity = await client.ensureIdentity(role);
        expect(identity.identityId).toMatch(/^id_/);
        expect(identity.publicKey).toBeTruthy();
        expect(identity.privateKey).toBeTruthy();
      }
    });

    it('locks saboteur bond and attaches multiple write actions', async () => {
      // Saboteur bond: enough for 3 mutations at 10¢ each (need 36¢ with 1.2x overhead)
      const bond = await client.lockBond('saboteur', 100, MIN_TTL_SECONDS, 'epistemic-poisoning round 1 saboteur');
      expect(bond.bondId).toMatch(/^bond_/);
      expect(bond.status).toBe('active');

      // Attach 3 write actions
      const actionIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const action = await client.executeAction(
          'saboteur',
          bond.bondId,
          ACTION_TYPE_WRITE,
          { fragment_id: `policy_v2_f${i + 1}`, mutation_class: 'numerical_drift', round: 1 },
          SABOTEUR_EXPOSURE_CENTS,
        );
        expect(action.actionId).toMatch(/^action_/);
        actionIds.push(action.actionId);
      }

      expect(actionIds).toHaveLength(3);
      // All action IDs should be unique
      expect(new Set(actionIds).size).toBe(3);
    });

    it('locks target bond and attaches decision action', async () => {
      const bond = await client.lockBond('target', 100, MIN_TTL_SECONDS, 'epistemic-poisoning round 1 target');
      expect(bond.bondId).toMatch(/^bond_/);

      const action = await client.executeAction(
        'target',
        bond.bondId,
        ACTION_TYPE_DECISION,
        { applicant_id: 'applicant_001', decision: 'approve', risk_score: 0.35, round: 1 },
        TARGET_EXPOSURE_CENTS,
      );
      expect(action.actionId).toMatch(/^action_/);
    });

    it('resolver settles actions per liability mode', async () => {
      // Create fresh bonds + actions for this test
      const sabBond = await client.lockBond('saboteur', 100, MIN_TTL_SECONDS, 'resolve test saboteur');
      const tgtBond = await client.lockBond('target', 100, MIN_TTL_SECONDS, 'resolve test target');

      const sabAction = await client.executeAction(
        'saboteur',
        sabBond.bondId,
        ACTION_TYPE_WRITE,
        { fragment_id: 'f1', mutation_class: 'drift', round: 99 },
        SABOTEUR_EXPOSURE_CENTS,
      );

      const tgtAction = await client.executeAction(
        'target',
        tgtBond.bondId,
        ACTION_TYPE_DECISION,
        { decision: 'reject', round: 99 },
        TARGET_EXPOSURE_CENTS,
      );

      // Compute settlements using resolver logic
      const settlements = computeSettlements({
        liabilityMode: 'both',
        saboteurActions: [
          { actionId: sabAction.actionId, fragmentId: 'f1', classification: 'poisoning_caused' },
        ],
        targetAction: {
          actionId: tgtAction.actionId,
          decisionMatchesOracle: false,
          citedPoisonedFragment: true,
        },
      });

      // Saboteur should be slashed (caused + both mode)
      expect(settlements[0].outcome).toBe('malicious');
      // Target should be slashed (diverged + cited + both mode)
      expect(settlements[1].outcome).toBe('malicious');

      // Execute settlements against AgentGate
      for (const s of settlements) {
        const result = await client.resolveAction(s.actionId, s.outcome);
        expect(result.actionId).toBe(s.actionId);
        expect(result.outcome).toBe(s.outcome);
      }
    });

    it('retrieves reputation after settlements', async () => {
      const rep = await client.getReputation('saboteur');
      expect(rep).toBeDefined();
    });
  });
});
