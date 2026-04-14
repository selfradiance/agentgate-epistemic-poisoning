/**
 * AgentGate HTTP client for the epistemic-poisoning simulator.
 *
 * Manages three identities (saboteur, target, resolver) and provides
 * bond locking, action execution, and action resolution with retry.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { signRequest, generateKeyPair } from './signing.js';
import {
  AgentIdentity,
  AgentIdentitySchema,
  AgentRole,
  LockBondResponse,
  LockBondResponseSchema,
  ExecuteActionResponse,
  ExecuteActionResponseSchema,
  ResolveActionResponse,
  ResolveActionResponseSchema,
} from './types.js';

// ============================================================
// Config
// ============================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const IDENTITY_DIR = path.resolve(process.cwd());

// ============================================================
// Helpers
// ============================================================

function identityFilePath(role: AgentRole): string {
  return path.join(IDENTITY_DIR, `agent-identity-${role}.json`);
}

function isTransientError(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const json = await response.json();
      return typeof json.message === 'string' ? json.message : JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return '';
  }
}

// ============================================================
// AgentGateClient
// ============================================================

export class AgentGateClient {
  private identities: Map<AgentRole, AgentIdentity> = new Map();
  private restKey?: string;

  constructor(private baseUrl: string, restKey?: string) {
    this.restKey = restKey;
  }

  // ── Identity management ──────────────────────────────────

  async ensureIdentity(role: AgentRole): Promise<AgentIdentity> {
    const cached = this.identities.get(role);
    if (cached) return cached;

    const filePath = identityFilePath(role);

    // Try loading from disk
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const parsed = AgentIdentitySchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.identities.set(role, parsed.data);
        return parsed.data;
      }
      console.warn(`  AgentGate: Identity file ${filePath} failed validation: ${parsed.error.message} — regenerating`);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`  AgentGate: Unexpected error reading ${filePath}: ${err} — regenerating`);
      }
    }

    // Generate new keypair and register
    const { publicKey, privateKey } = generateKeyPair();
    const identityId = await this.registerIdentity(publicKey, privateKey, role);

    const identity: AgentIdentity = { identityId, publicKey, privateKey };
    await fs.promises.writeFile(filePath, JSON.stringify(identity, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });

    this.identities.set(role, identity);
    return identity;
  }

  getIdentity(role: AgentRole): AgentIdentity | undefined {
    return this.identities.get(role);
  }

  private async registerIdentity(
    publicKey: string,
    privateKey: string,
    agentName: string,
  ): Promise<string> {
    const apiPath = '/v1/identities';
    const body = { publicKey, agentName };
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const signature = signRequest(publicKey, privateKey, nonce, 'POST', apiPath, timestamp, body);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-agentgate-timestamp': timestamp,
      'x-agentgate-signature': signature,
      'x-nonce': nonce,
    };
    if (this.restKey) {
      headers['x-agentgate-key'] = this.restKey;
    }

    const response = await fetch(new URL(apiPath, this.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await parseErrorBody(response);

      // Handle duplicate identity (409) — re-read from server or re-generate
      if (response.status === 409) {
        throw new Error(
          `Identity '${agentName}' already exists on AgentGate. ` +
            `Delete agent-identity-${agentName}.json and retry.`,
        );
      }

      throw new Error(`POST ${apiPath} failed: HTTP ${response.status} ${detail}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const identityId = result.identityId ?? result.id;
    if (typeof identityId !== 'string' || identityId.length === 0) {
      throw new Error(`POST ${apiPath} succeeded but did not return a valid identityId`);
    }
    return identityId;
  }

  // ── Signed POST with retry ──────────────────────────────

  private async signedPost<T>(
    identity: AgentIdentity,
    apiPath: string,
    body: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Fresh nonce + timestamp on every attempt (build plan: never reuse signed headers)
      const timestamp = Date.now().toString();
      const nonce = randomUUID();
      const signature = signRequest(
        identity.publicKey,
        identity.privateKey,
        nonce,
        'POST',
        apiPath,
        timestamp,
        body,
      );

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-agentgate-timestamp': timestamp,
        'x-agentgate-signature': signature,
        'x-nonce': nonce,
      };
      if (this.restKey) {
        headers['x-agentgate-key'] = this.restKey;
      }

      let response: Response;
      try {
        response = await fetch(new URL(apiPath, this.baseUrl), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Only retry when the request never produced an HTTP response.
        if (attempt < MAX_RETRIES) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        break;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      const detail = await parseErrorBody(response);
      lastError = new Error(`POST ${apiPath} failed: HTTP ${response.status} ${detail}`);

      // Only retry on transient HTTP errors.
      if (!isTransientError(response.status)) {
        throw lastError;
      }

      // Exponential backoff before retry
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }

    throw lastError ?? new Error(`POST ${apiPath} failed after ${MAX_RETRIES} retries`);
  }

  // ── Bond operations ─────────────────────────────────────

  async lockBond(
    role: AgentRole,
    amountCents: number,
    ttlSeconds: number,
    reason: string,
  ): Promise<LockBondResponse> {
    const identity = await this.ensureIdentity(role);
    const raw = await this.signedPost<unknown>(identity, '/v1/bonds/lock', {
      identityId: identity.identityId,
      amountCents,
      currency: 'USD',
      ttlSeconds,
      reason,
    });
    const parsed = LockBondResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`AgentGate lockBond response validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  // ── Action operations ───────────────────────────────────

  async executeAction(
    role: AgentRole,
    bondId: string,
    actionType: string,
    payload: Record<string, unknown>,
    exposureCents: number,
  ): Promise<ExecuteActionResponse> {
    const identity = await this.ensureIdentity(role);
    const raw = await this.signedPost<unknown>(identity, '/v1/actions/execute', {
      identityId: identity.identityId,
      actionType,
      payload,
      bondId,
      exposure_cents: exposureCents,
    });
    const parsed = ExecuteActionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`AgentGate executeAction response validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  async resolveAction(
    actionId: string,
    outcome: 'success' | 'failed' | 'malicious',
  ): Promise<ResolveActionResponse> {
    const resolver = await this.ensureIdentity('resolver');
    const raw = await this.signedPost<unknown>(
      resolver,
      `/v1/actions/${actionId}/resolve`,
      {
        outcome,
        resolverId: resolver.identityId,
      },
    );
    const parsed = ResolveActionResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`AgentGate resolveAction response validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  // ── Read-only ───────────────────────────────────────────

  async getReputation(role: AgentRole): Promise<unknown> {
    const identity = this.identities.get(role);
    if (!identity) throw new Error(`Identity for '${role}' not initialized`);

    const response = await fetch(new URL(`/v1/identities/${identity.identityId}`, this.baseUrl));
    if (!response.ok) {
      const detail = await parseErrorBody(response);
      throw new Error(`GET /v1/identities/${identity.identityId} failed: HTTP ${response.status} ${detail}`);
    }
    return response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(new URL('/health', this.baseUrl));
      return response.ok;
    } catch {
      return false;
    }
  }
}
