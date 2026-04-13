import { describe, it, expect } from 'vitest';
import { computeOracle } from '../src/oracle/oracle.js';
import { OracleOutputSchema } from '../src/oracle/types.js';
import { APPLICANT_SCENARIOS } from '../src/kb/seed-data.js';

describe('Oracle', () => {
  // ============================================================
  // Schema validation
  // ============================================================

  it('produces valid OracleOutput for all scenarios', () => {
    for (const scenario of APPLICANT_SCENARIOS) {
      const output = computeOracle(scenario.data);
      const result = OracleOutputSchema.safeParse(output);
      expect(result.success, `Schema validation failed for ${scenario.name}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  // ============================================================
  // TechFlow Solutions — borderline approve
  // ============================================================

  describe('TechFlow Solutions (applicant_001)', () => {
    const scenario = APPLICANT_SCENARIOS.find((s) => s.id === 'applicant_001')!;
    const output = computeOracle(scenario.data);

    it('decides APPROVE', () => {
      expect(output.canonical_decision).toBe('approve');
    });

    it('computes correct risk score', () => {
      // DTI: 456000/1200000 = 0.38, no contingent liabilities
      // risk = (0.38 × 0.35) + (0.5 × 0.30) + (0.4 × 0.15) + (0.125 × 0.10) + (0.3 × 0.10)
      //      = 0.133 + 0.15 + 0.06 + 0.0125 + 0.03 = 0.3855
      expect(output.expected_risk_band.low).toBeCloseTo(0.3855 - 0.05, 2);
      expect(output.expected_risk_band.high).toBeCloseTo(0.3855 + 0.05, 2);
    });

    it('computes correct loss estimate', () => {
      // Moderate risk (0.3-0.5) → 8% PD, commercial real estate → 65% recovery
      // loss = 0.08 × 400000 × 0.35 = $11,200
      expect(output.expected_loss_band.low).toBe(Math.round(11_200 * 0.75));
      expect(output.expected_loss_band.high).toBe(Math.round(11_200 * 1.25));
    });

    it('passes all eligibility checks', () => {
      expect(output.rules_applied.some((r) => r.includes('PASS: Revenue'))).toBe(true);
      expect(output.rules_applied.some((r) => r.includes('PASS: Years'))).toBe(true);
      expect(output.rules_applied.some((r) => r.includes('PASS: No active bankruptcy'))).toBe(true);
    });

    it('has no disqualifying factors', () => {
      expect(output.rules_applied.some((r) => r.includes('Disqualifying'))).toBe(false);
    });
  });

  // ============================================================
  // GreenLeaf Manufacturing — clear reject
  // ============================================================

  describe('GreenLeaf Manufacturing (applicant_002)', () => {
    const scenario = APPLICANT_SCENARIOS.find((s) => s.id === 'applicant_002')!;
    const output = computeOracle(scenario.data);

    it('decides REJECT', () => {
      expect(output.canonical_decision).toBe('reject');
    });

    it('identifies DTI disqualifying factor', () => {
      // DTI = (300000 + 40000) / 600000 = 0.5667 (includes contingent liabilities)
      expect(output.rules_applied.some((r) => r.includes('DTI') && r.includes('exceeds 0.40'))).toBe(true);
    });

    it('computes correct risk score with contingent liabilities', () => {
      // DTI: (300000 + 40000) / 600000 = 0.5667
      // risk = (0.5667 × 0.35) + (0.5 × 0.30) + (0.5 × 0.15) + (0.4 × 0.10) + (0.6 × 0.10)
      //      = 0.1983 + 0.15 + 0.075 + 0.04 + 0.06 = 0.5233
      const expectedScore = (340_000 / 600_000) * 0.35 + 0.5 * 0.30 + 0.5 * 0.15 + 0.4 * 0.10 + 0.6 * 0.10;
      expect(output.expected_risk_band.low).toBeCloseTo(expectedScore - 0.05, 2);
      expect(output.expected_risk_band.high).toBeCloseTo(expectedScore + 0.05, 2);
    });

    it('computes loss with equipment recovery rate', () => {
      // High risk (>0.5) → 18% PD, equipment → 45% recovery
      // loss = 0.18 × 250000 × 0.55 = $24,750
      expect(output.expected_loss_band.low).toBe(Math.round(24_750 * 0.75));
      expect(output.expected_loss_band.high).toBe(Math.round(24_750 * 1.25));
    });
  });

  // ============================================================
  // Summit Consulting Group — clear approve
  // ============================================================

  describe('Summit Consulting Group (applicant_003)', () => {
    const scenario = APPLICANT_SCENARIOS.find((s) => s.id === 'applicant_003')!;
    const output = computeOracle(scenario.data);

    it('decides APPROVE', () => {
      expect(output.canonical_decision).toBe('approve');
    });

    it('computes low risk score', () => {
      // DTI: 600000/3000000 = 0.20
      // risk = (0.20 × 0.35) + (0.2 × 0.30) + (0.4 × 0.15) + (0.0 × 0.10) + (0.0 × 0.10)
      //      = 0.07 + 0.06 + 0.06 + 0 + 0 = 0.19
      expect(output.expected_risk_band.low).toBeCloseTo(0.19 - 0.05, 2);
      expect(output.expected_risk_band.high).toBeCloseTo(0.19 + 0.05, 2);
    });

    it('computes loss with low risk PD', () => {
      // Low risk (<0.3) → 2% PD, commercial real estate → 65% recovery
      // loss = 0.02 × 500000 × 0.35 = $3,500
      expect(output.expected_loss_band.low).toBe(Math.round(3_500 * 0.75));
      expect(output.expected_loss_band.high).toBe(Math.round(3_500 * 1.25));
    });

    it('has no disqualifying factors', () => {
      expect(output.rules_applied.some((r) => r.includes('Disqualifying'))).toBe(false);
    });

    it('has collateral_gap of 0 (fully covered)', () => {
      // collateral $800k > loan $500k → gap = max(0, 1 - 1.6) = 0
      expect(output.rules_applied.some((r) => r.includes('collateral_gap=0'))).toBe(true);
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================

  describe('Edge cases', () => {
    it('rejects for low revenue', () => {
      const output = computeOracle({
        applicant_id: 'test_low_rev',
        company_name: 'Small Corp',
        annual_revenue: 200_000,
        years_in_operation: 5,
        industry: 'Technology',
        has_active_bankruptcy: false,
        total_annual_debt: 50_000,
        credit_score: 750,
        loan_amount: 100_000,
        collateral_value: 200_000,
        collateral_type: 'commercial_real_estate',
        late_payments_24m: 0,
        has_contingent_liabilities: false,
        contingent_liability_amount: 0,
      });
      expect(output.canonical_decision).toBe('reject');
      expect(output.rules_applied.some((r) => r.includes('Revenue below'))).toBe(true);
    });

    it('rejects for active bankruptcy', () => {
      const output = computeOracle({
        applicant_id: 'test_bankrupt',
        company_name: 'Bankrupt Corp',
        annual_revenue: 1_000_000,
        years_in_operation: 10,
        industry: 'Technology',
        has_active_bankruptcy: true,
        total_annual_debt: 100_000,
        credit_score: 750,
        loan_amount: 200_000,
        collateral_value: 500_000,
        collateral_type: 'commercial_real_estate',
        late_payments_24m: 0,
        has_contingent_liabilities: false,
        contingent_liability_amount: 0,
      });
      expect(output.canonical_decision).toBe('reject');
      expect(output.rules_applied.some((r) => r.includes('bankruptcy'))).toBe(true);
    });

    it('includes contingent liabilities in DTI', () => {
      // Without contingent: DTI = 200000/1000000 = 0.20 → approve
      // With contingent $250k: DTI = 450000/1000000 = 0.45 → DTI > 0.40, reject
      const output = computeOracle({
        applicant_id: 'test_contingent',
        company_name: 'Contingent Corp',
        annual_revenue: 1_000_000,
        years_in_operation: 5,
        industry: 'Technology',
        has_active_bankruptcy: false,
        total_annual_debt: 200_000,
        credit_score: 720,
        loan_amount: 300_000,
        collateral_value: 400_000,
        collateral_type: 'commercial_real_estate',
        late_payments_24m: 0,
        has_contingent_liabilities: true,
        contingent_liability_amount: 250_000,
      });
      expect(output.canonical_decision).toBe('reject');
      expect(output.rules_applied.some((r) => r.includes('DTI') && r.includes('exceeds 0.40'))).toBe(true);
    });
  });
});
