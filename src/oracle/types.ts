import { z } from 'zod';

export const OracleOutputSchema = z.object({
  applicant_id: z.string(),
  canonical_decision: z.enum(['approve', 'reject']),
  expected_risk_band: z.object({
    low: z.number(),
    high: z.number(),
  }),
  expected_loss_band: z.object({
    low: z.number(),
    high: z.number(),
  }),
  rules_applied: z.array(z.string()),
});

export type OracleOutput = z.infer<typeof OracleOutputSchema>;

export interface ApplicantData {
  applicant_id: string;
  company_name: string;
  annual_revenue: number;
  years_in_operation: number;
  industry: 'Technology' | 'Manufacturing' | 'Retail' | 'Construction';
  has_active_bankruptcy: boolean;
  total_annual_debt: number;
  credit_score: number;
  loan_amount: number;
  collateral_value: number;
  collateral_type: 'commercial_real_estate' | 'equipment' | 'inventory' | 'unsecured';
  late_payments_24m: number;
  has_contingent_liabilities: boolean;
  contingent_liability_amount: number;
}
