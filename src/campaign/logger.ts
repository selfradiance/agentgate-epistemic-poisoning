/**
 * Campaign logging — JSON log files and checkpoint management.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CampaignResult, CampaignCheckpoint, CampaignSummary } from './types.js';

const LOGS_DIR = path.resolve(process.cwd(), 'logs');

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

// ============================================================
// Campaign log
// ============================================================

export function writeCampaignLog(result: CampaignResult): string {
  ensureLogsDir();
  const filename = `${result.campaignId}.json`;
  const filepath = path.join(LOGS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return filepath;
}

// ============================================================
// Checkpoint
// ============================================================

export function writeCheckpoint(filepath: string, checkpoint: CampaignCheckpoint): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(checkpoint, null, 2) + '\n', 'utf8');
}

export function loadCheckpoint(filepath: string): CampaignCheckpoint | null {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw) as CampaignCheckpoint;
  } catch {
    return null;
  }
}

// ============================================================
// Summary formatting for CLI output
// ============================================================

export function formatSummary(summary: CampaignSummary, liabilityMode: string): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  CAMPAIGN SUMMARY');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`  Liability Mode:       ${liabilityMode}`);
  lines.push(`  Total Rounds:         ${summary.totalRounds}`);
  lines.push(`  Valid Rounds:         ${summary.validRounds}`);
  lines.push(`  Baseline Unstable:    ${summary.baselineUnstableRounds}`);
  lines.push(`  Poisoned Unstable:    ${summary.poisonedUnstableRounds}`);
  lines.push(`  Baseline Error:       ${summary.baselineErrorRounds}`);
  lines.push(`  Invalid Rounds:       ${summary.invalidRounds}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  POISONING EFFECTIVENESS');
  lines.push('-'.repeat(60));
  lines.push(`  Decision Flip Rate:   ${(summary.decisionFlipRate * 100).toFixed(1)}%`);
  lines.push(`  Mean Risk Delta:      ${summary.meanRiskScoreDelta >= 0 ? '+' : ''}${summary.meanRiskScoreDelta.toFixed(4)}`);
  lines.push(`  Mean Confidence Delta: ${summary.meanConfidenceDelta >= 0 ? '+' : ''}${summary.meanConfidenceDelta.toFixed(4)}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  ATTRIBUTION BREAKDOWN');
  lines.push('-'.repeat(60));
  lines.push(`  Poisoning Caused:     ${summary.attributionBreakdown.poisoning_caused}`);
  lines.push(`  Poisoning Correlated: ${summary.attributionBreakdown.poisoning_correlated}`);
  lines.push(`  Noise:                ${summary.attributionBreakdown.noise}`);
  lines.push(`  Baseline Error:       ${summary.attributionBreakdown.baseline_error}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('  BOND OUTCOMES');
  lines.push('-'.repeat(60));
  lines.push(`  Saboteur Malicious:   ${summary.bondOutcomes.saboteurMalicious}`);
  lines.push(`  Saboteur Success:     ${summary.bondOutcomes.saboteurSuccess}`);
  lines.push(`  Target Malicious:     ${summary.bondOutcomes.targetMalicious}`);
  lines.push(`  Target Success:       ${summary.bondOutcomes.targetSuccess}`);
  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
