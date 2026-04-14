/**
 * Trace writer — serializes RoundTrace to per-round directories.
 *
 * Directory structure:
 *   logs/{campaignId}/
 *     round-{N}-{roundId}/
 *       trace.json          — full RoundTrace
 *       transcripts.json    — prompt/response transcripts
 *       mutations.json      — normalized mutation diffs
 *       citations.json      — citation mappings
 *       agentgate.json      — AgentGate request/response logs
 *       timing.json         — phase timing breakdown
 *       attributions.json   — attribution chain details
 */

import fs from 'node:fs';
import path from 'node:path';
import { RoundTrace } from './types.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(filepath: string, data: unknown): void {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}

export function writeRoundTrace(campaignId: string, trace: RoundTrace): string {
  const roundDir = path.join(
    LOGS_DIR,
    campaignId,
    `round-${trace.roundNumber}-${trace.roundId}`,
  );
  ensureDir(roundDir);

  // Full trace
  writeJson(path.join(roundDir, 'trace.json'), trace);

  // Individual artifact files for easy inspection
  writeJson(path.join(roundDir, 'transcripts.json'), trace.transcripts);
  writeJson(path.join(roundDir, 'mutations.json'), trace.mutationDiffs);
  writeJson(path.join(roundDir, 'citations.json'), trace.citationMappings);
  writeJson(path.join(roundDir, 'agentgate.json'), trace.agentgateLogs);
  writeJson(path.join(roundDir, 'timing.json'), trace.phaseTimings);
  writeJson(path.join(roundDir, 'attributions.json'), trace.attributionDetails);

  return roundDir;
}
