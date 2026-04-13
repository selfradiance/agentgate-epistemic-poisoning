import { ApplicantData, OracleOutput } from './types.js';

// ============================================================
// Risk scoring components — match policy_v2 Section 2 exactly
// ============================================================

const INDUSTRY_RISK: Record<string, number> = {
  Technology: 0.4,
  Manufacturing: 0.5,
  Retail: 0.6,
  Construction: 0.7,
};

const RECOVERY_RATES: Record<string, number> = {
  commercial_real_estate: 0.65,
  equipment: 0.45,
  inventory: 0.30,
  unsecured: 0.10,
};

function getCreditRiskFactor(creditScore: number): number {
  if (creditScore >= 700) return 0.2;
  if (creditScore >= 600) return 0.5;
  return 0.8;
}

function getPaymentHistoryFactor(latePayments: number): number {
  if (latePayments === 0) return 0.0;
  if (latePayments === 1) return 0.3;
  return 0.6;
}

function getProbabilityOfDefault(riskScore: number): number {
  if (riskScore < 0.3) return 0.02;
  if (riskScore <= 0.5) return 0.08;
  return 0.18;
}

// ============================================================
// Oracle computation — deterministic, matches policy exactly
// ============================================================

export function computeOracle(applicant: ApplicantData): OracleOutput {
  const rulesApplied: string[] = [];

  // Step 1: Eligibility checks
  if (applicant.annual_revenue < 500_000) {
    rulesApplied.push('REJECT: Revenue below $500,000 minimum');
    return rejectResult(applicant, rulesApplied, 1.0);
  }
  rulesApplied.push('PASS: Revenue >= $500,000');

  if (applicant.years_in_operation < 2) {
    rulesApplied.push('REJECT: Less than 2 years in operation');
    return rejectResult(applicant, rulesApplied, 1.0);
  }
  rulesApplied.push('PASS: Years in operation >= 2');

  if (applicant.has_active_bankruptcy) {
    rulesApplied.push('REJECT: Active bankruptcy proceedings');
    return rejectResult(applicant, rulesApplied, 1.0);
  }
  rulesApplied.push('PASS: No active bankruptcy');

  // Step 2: DTI calculation (including contingent liabilities per Section 5)
  const totalDebt = applicant.total_annual_debt +
    (applicant.has_contingent_liabilities ? applicant.contingent_liability_amount : 0);
  const dtiRatio = totalDebt / applicant.annual_revenue;
  rulesApplied.push(`DTI calculated: ${totalDebt} / ${applicant.annual_revenue} = ${dtiRatio.toFixed(4)}`);

  // Step 3: Check disqualifying factors
  const disqualifiers: string[] = [];

  if (dtiRatio > 0.40) {
    disqualifiers.push(`DTI ${dtiRatio.toFixed(2)} exceeds 0.40`);
  }
  if (applicant.credit_score < 580) {
    disqualifiers.push(`Credit score ${applicant.credit_score} below 580`);
  }
  if (applicant.has_active_bankruptcy) {
    disqualifiers.push('Active bankruptcy');
  }

  // Step 4: Compute risk score components
  const creditRiskFactor = getCreditRiskFactor(applicant.credit_score);
  const industryRisk = INDUSTRY_RISK[applicant.industry] ?? 0.5;
  const collateralGap = Math.max(0, 1.0 - (applicant.collateral_value / applicant.loan_amount));
  const paymentHistoryFactor = getPaymentHistoryFactor(applicant.late_payments_24m);

  rulesApplied.push(`Components: dti=${dtiRatio.toFixed(4)}, credit=${creditRiskFactor}, industry=${industryRisk}, collateral_gap=${collateralGap.toFixed(4)}, payment=${paymentHistoryFactor}`);

  // Step 5: Compute total risk score (Section 2 formula)
  const riskScore =
    (dtiRatio * 0.35) +
    (creditRiskFactor * 0.30) +
    (industryRisk * 0.15) +
    (collateralGap * 0.10) +
    (paymentHistoryFactor * 0.10);

  rulesApplied.push(`Risk score: ${riskScore.toFixed(4)}`);

  // Step 6: Apply decision rules (Section 3)
  if (disqualifiers.length > 0) {
    rulesApplied.push(`REJECT: Disqualifying factors: ${disqualifiers.join('; ')}`);
    return buildResult(applicant, 'reject', riskScore, rulesApplied);
  }

  if (riskScore >= 0.65) {
    rulesApplied.push(`REJECT: Risk score ${riskScore.toFixed(4)} >= 0.65`);
    return buildResult(applicant, 'reject', riskScore, rulesApplied);
  }

  if (riskScore >= 0.45) {
    rulesApplied.push(`REJECT: Risk score ${riskScore.toFixed(4)} in manual review zone (0.45-0.64), auto-reject`);
    return buildResult(applicant, 'reject', riskScore, rulesApplied);
  }

  rulesApplied.push(`APPROVE: Risk score ${riskScore.toFixed(4)} < 0.45, no disqualifying factors`);
  return buildResult(applicant, 'approve', riskScore, rulesApplied);
}

// ============================================================
// Result builders
// ============================================================

function buildResult(
  applicant: ApplicantData,
  decision: 'approve' | 'reject',
  riskScore: number,
  rulesApplied: string[],
): OracleOutput {
  const pd = getProbabilityOfDefault(riskScore);
  const recoveryRate = RECOVERY_RATES[applicant.collateral_type] ?? 0.10;
  const expectedLoss = pd * applicant.loan_amount * (1.0 - recoveryRate);

  // Risk band: ±0.05 around computed score
  const riskBandMargin = 0.05;
  // Loss band: ±25% around expected loss
  const lossBandMargin = 0.25;

  return {
    applicant_id: applicant.applicant_id,
    canonical_decision: decision,
    expected_risk_band: {
      low: Math.max(0, riskScore - riskBandMargin),
      high: Math.min(1, riskScore + riskBandMargin),
    },
    expected_loss_band: {
      low: Math.round(expectedLoss * (1 - lossBandMargin)),
      high: Math.round(expectedLoss * (1 + lossBandMargin)),
    },
    rules_applied: rulesApplied,
  };
}

function rejectResult(
  applicant: ApplicantData,
  rulesApplied: string[],
  riskScore: number,
): OracleOutput {
  return buildResult(applicant, 'reject', riskScore, rulesApplied);
}
