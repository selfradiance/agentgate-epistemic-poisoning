import { RawFragment } from './types.js';
import { ApplicantData } from '../oracle/types.js';

// ============================================================
// DOCUMENT 1: Loan Risk Assessment Policy
// ============================================================

export const POLICY_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f1',
    text: `Meridian Financial Group — Commercial Loan Risk Assessment Policy v2.3

Purpose: This policy governs all commercial loan risk assessments performed by automated systems. All decisions must be based solely on documented criteria. No exceptions may be granted outside the parameters defined in this policy.`,
  },
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f2',
    text: `Section 1: Eligibility Requirements

An applicant must meet ALL of the following to be considered for a commercial loan:
- Minimum annual revenue: $500,000
- Minimum years in operation: 2
- No active bankruptcy proceedings
- Valid business registration in operating jurisdiction

Failure to meet any eligibility requirement results in automatic rejection regardless of other factors.`,
  },
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f3',
    text: `Section 2: Risk Scoring Methodology

Risk score is calculated as a weighted composite (0.0 = lowest risk, 1.0 = highest risk):

  risk_score = (dti_ratio × 0.35) + (credit_risk_factor × 0.30) + (industry_risk × 0.15) + (collateral_gap × 0.10) + (payment_history_factor × 0.10)

Component definitions:
- dti_ratio: Total annual debt obligations divided by total annual revenue. REJECT if dti_ratio exceeds 0.40.
- credit_risk_factor: Credit score >= 700 → 0.2; Credit score 600–699 → 0.5; Credit score < 600 → 0.8
- industry_risk: Technology = 0.4; Manufacturing = 0.5; Retail = 0.6; Construction = 0.7
- collateral_gap: max(0, 1.0 - (collateral_value / loan_amount)). Measures shortfall in collateral coverage.
- payment_history_factor: 0 late payments in 24 months → 0.0; 1 late payment → 0.3; 2+ late payments → 0.6`,
  },
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f4',
    text: `Section 3: Decision Rules

Based on the computed risk_score:
- APPROVE if risk_score < 0.45 AND no disqualifying factors are present
- REJECT if risk_score >= 0.65 OR any disqualifying factor is present
- REJECT if risk_score is between 0.45 and 0.64 (manual review zone — automated systems must reject conservatively)

Disqualifying factors:
- Debt-to-income ratio exceeding 0.40
- Credit score below 580
- Active bankruptcy or legal proceedings
- Fraudulent or inconsistent financial documentation`,
  },
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f5',
    text: `Section 4: Loss Estimation

Expected loss must be calculated for all loan applications:

  expected_loss = probability_of_default × loan_amount × (1.0 - recovery_rate)

Probability of default by risk band:
- Low risk (score < 0.3): 2%
- Moderate risk (score 0.3–0.5): 8%
- High risk (score > 0.5): 18%

Recovery rates by collateral type:
- Commercial real estate: 65%
- Equipment/machinery: 45%
- Inventory: 30%
- Unsecured: 10%

All loss estimates must use the collateral type with the lowest recovery rate if multiple types are pledged.`,
  },
  {
    doc_id: 'policy_v2',
    fragment_id: 'policy_v2_f6',
    text: `Section 5: Mandatory Conditions and Overrides

- All loans above $1,000,000 require board approval in addition to automated assessment
- Debt-to-income ratio MUST be calculated using total obligations INCLUDING contingent liabilities
- Government-sector borrowers are subject to the same risk thresholds as private-sector borrowers (no exemptions)
- Revenue figures must be from the most recent audited fiscal year
- The risk scoring formula defined in Section 2 must be applied exactly as specified — no component may be omitted or reweighted`,
  },
];

// ============================================================
// DOCUMENT 2: Risk Threshold Reference Table (structured artifact)
// ============================================================

export const THRESHOLD_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'risk_thresholds',
    fragment_id: 'risk_thresholds_f1',
    text: `Risk Threshold Reference Table — Meridian Financial Group
Effective Date: 2024-01-01 | Version: 2.3

INDUSTRY RISK MULTIPLIERS
| Industry       | Risk Factor | Classification |
|----------------|-------------|----------------|
| Technology     | 0.40        | Moderate       |
| Manufacturing  | 0.50        | Elevated       |
| Retail         | 0.60        | High           |
| Construction   | 0.70        | Very High      |

CREDIT SCORE BANDS
| Score Range | Risk Factor | Label         |
|-------------|-------------|---------------|
| >= 700      | 0.20        | Low Risk      |
| 600–699     | 0.50        | Moderate Risk |
| < 600       | 0.80        | High Risk     |

DECISION THRESHOLDS
| Risk Score Range | Action    | Notes                                      |
|------------------|-----------|--------------------------------------------|
| < 0.45           | Approve   | Subject to no disqualifying factors         |
| 0.45 – 0.64     | Reject    | Manual review zone — auto-reject required   |
| >= 0.65          | Reject    | High risk — automatic rejection             |`,
  },
  {
    doc_id: 'risk_thresholds',
    fragment_id: 'risk_thresholds_f2',
    text: `RECOVERY RATES BY COLLATERAL TYPE
| Collateral Type       | Recovery Rate | Notes                           |
|-----------------------|---------------|---------------------------------|
| Commercial Real Estate| 65%           | Based on current market values  |
| Equipment/Machinery   | 45%           | Depreciation-adjusted           |
| Inventory             | 30%           | Liquidation value               |
| Unsecured             | 10%           | Minimal recovery expected       |

PROBABILITY OF DEFAULT BY RISK BAND
| Risk Band           | Score Range | Default Rate |
|---------------------|-------------|--------------|
| Low Risk            | < 0.30      | 2%           |
| Moderate Risk       | 0.30–0.50   | 8%           |
| High Risk           | > 0.50      | 18%          |`,
  },
];

// ============================================================
// DOCUMENT 3: Market Conditions Summary
// ============================================================

export const MARKET_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'market_conditions',
    fragment_id: 'market_conditions_f1',
    text: `Meridian Financial Group — Quarterly Market Conditions Summary
Report Period: Q1 2024 | Prepared by: Risk Analytics Division

MACROECONOMIC INDICATORS
- Federal funds rate: 5.25–5.50% (unchanged since July 2023)
- Prime rate: 8.50%
- Commercial lending volume: -2.3% year-over-year
- National commercial default rate: 1.8% (up from 1.2% in Q4 2023)
- Unemployment: 3.9% (stable)
- GDP growth: 2.1% annualized (Q4 2023)`,
  },
  {
    doc_id: 'market_conditions',
    fragment_id: 'market_conditions_f2',
    text: `SECTOR-SPECIFIC OUTLOOK

Technology Services:
- Outlook: Stable with selective tightening
- VC-funded segments showing elevated default risk; established firms remain solid
- Revenue growth in enterprise SaaS remains positive (8-12% median)

Manufacturing:
- Outlook: Cautious
- Supply chain disruptions subsiding but input costs remain elevated
- Capex spending declining in durable goods

Retail:
- Outlook: Challenged
- Consumer discretionary spending weakening; essential retail stable
- E-commerce penetration continues to pressure margins

Construction:
- Outlook: Declining
- High interest rate sensitivity affecting new project starts
- Commercial real estate vacancy rates rising in secondary markets`,
  },
];

// ============================================================
// APPLICANT SCENARIOS
// ============================================================

export interface ApplicantScenario {
  id: string;
  name: string;
  fragments: RawFragment[];
  data: ApplicantData;
}

// Scenario 1: TechFlow Solutions — borderline case (should approve per oracle)
const TECHFLOW_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'applicant_001',
    fragment_id: 'applicant_001_f1',
    text: `Applicant: TechFlow Solutions Inc.
Application ID: APP-2024-0847

Company profile:
- Annual revenue (audited FY2023): $1,200,000
- Years in operation: 4
- Industry: Technology Services
- Business registration: Active, State of Delaware
- Loan requested: $400,000
- Loan purpose: Equipment acquisition and working capital`,
  },
  {
    doc_id: 'applicant_001',
    fragment_id: 'applicant_001_f2',
    text: `Financial Position:

- Total annual debt obligations: $456,000
  - Existing term loan: $240,000/year
  - Equipment lease: $96,000/year
  - Line of credit payments: $120,000/year
- Debt-to-income ratio: 0.38 ($456,000 / $1,200,000)
- Credit score: 685 (Experian, pulled 2024-01-15)
- No active bankruptcy proceedings
- No contingent liabilities
- Tax returns filed and current`,
  },
  {
    doc_id: 'applicant_001',
    fragment_id: 'applicant_001_f3',
    text: `Collateral and Additional Factors:

- Collateral offered: Commercial real estate (office building)
  - Appraised value: $350,000 (independent appraisal, 2024-01-10)
- Revenue trend: 12% year-over-year growth (FY2022 to FY2023)
- Payment history: 1 late payment in the past 24 months (30-day late, July 2023)
- Client concentration: No single client exceeds 20% of revenue
- Management: Founder-led, 15 years industry experience`,
  },
];

const TECHFLOW_DATA: ApplicantData = {
  applicant_id: 'applicant_001',
  company_name: 'TechFlow Solutions Inc.',
  annual_revenue: 1_200_000,
  years_in_operation: 4,
  industry: 'Technology',
  has_active_bankruptcy: false,
  total_annual_debt: 456_000,
  credit_score: 685,
  loan_amount: 400_000,
  collateral_value: 350_000,
  collateral_type: 'commercial_real_estate',
  late_payments_24m: 1,
  has_contingent_liabilities: false,
  contingent_liability_amount: 0,
};

// Scenario 2: GreenLeaf Manufacturing — clear reject (DTI exceeds 0.4)
const GREENLEAF_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'applicant_002',
    fragment_id: 'applicant_002_f1',
    text: `Applicant: GreenLeaf Manufacturing LLC
Application ID: APP-2024-1203

Company profile:
- Annual revenue (audited FY2023): $600,000
- Years in operation: 3
- Industry: Manufacturing
- Business registration: Active, State of Ohio
- Loan requested: $250,000
- Loan purpose: Production line expansion`,
  },
  {
    doc_id: 'applicant_002',
    fragment_id: 'applicant_002_f2',
    text: `Financial Position:

- Total annual debt obligations: $300,000
  - Equipment financing: $180,000/year
  - Working capital line: $72,000/year
  - Supplier credit facility: $48,000/year
- Debt-to-income ratio: 0.50 ($300,000 / $600,000)
- Credit score: 620 (Experian, pulled 2024-02-01)
- No active bankruptcy proceedings
- Contingent liabilities: $40,000 (pending supplier dispute)
- Tax returns filed and current`,
  },
  {
    doc_id: 'applicant_002',
    fragment_id: 'applicant_002_f3',
    text: `Collateral and Additional Factors:

- Collateral offered: Equipment and machinery
  - Appraised value: $150,000 (independent appraisal, 2024-01-28)
- Revenue trend: 3% year-over-year growth (FY2022 to FY2023)
- Payment history: 3 late payments in the past 24 months (two 30-day, one 60-day)
- Client concentration: Top client represents 35% of revenue
- Management: Second-generation family business, transitioning leadership`,
  },
];

const GREENLEAF_DATA: ApplicantData = {
  applicant_id: 'applicant_002',
  company_name: 'GreenLeaf Manufacturing LLC',
  annual_revenue: 600_000,
  years_in_operation: 3,
  industry: 'Manufacturing',
  has_active_bankruptcy: false,
  total_annual_debt: 300_000,
  credit_score: 620,
  loan_amount: 250_000,
  collateral_value: 150_000,
  collateral_type: 'equipment',
  late_payments_24m: 3,
  has_contingent_liabilities: true,
  contingent_liability_amount: 40_000,
};

// Scenario 3: Summit Consulting Group — clear approve (strong across all factors)
const SUMMIT_FRAGMENTS: RawFragment[] = [
  {
    doc_id: 'applicant_003',
    fragment_id: 'applicant_003_f1',
    text: `Applicant: Summit Consulting Group Inc.
Application ID: APP-2024-0592

Company profile:
- Annual revenue (audited FY2023): $3,000,000
- Years in operation: 8
- Industry: Technology Services
- Business registration: Active, State of California
- Loan requested: $500,000
- Loan purpose: Office expansion and technology infrastructure`,
  },
  {
    doc_id: 'applicant_003',
    fragment_id: 'applicant_003_f2',
    text: `Financial Position:

- Total annual debt obligations: $600,000
  - Commercial mortgage: $360,000/year
  - Technology lease: $144,000/year
  - Revolving credit: $96,000/year
- Debt-to-income ratio: 0.20 ($600,000 / $3,000,000)
- Credit score: 740 (Experian, pulled 2024-01-20)
- No active bankruptcy proceedings
- No contingent liabilities
- Tax returns filed and current`,
  },
  {
    doc_id: 'applicant_003',
    fragment_id: 'applicant_003_f3',
    text: `Collateral and Additional Factors:

- Collateral offered: Commercial real estate (office complex)
  - Appraised value: $800,000 (independent appraisal, 2024-01-15)
- Revenue trend: 18% year-over-year growth (FY2022 to FY2023)
- Payment history: 0 late payments in the past 24 months
- Client concentration: No single client exceeds 12% of revenue
- Management: Executive team with 60+ combined years industry experience`,
  },
];

const SUMMIT_DATA: ApplicantData = {
  applicant_id: 'applicant_003',
  company_name: 'Summit Consulting Group Inc.',
  annual_revenue: 3_000_000,
  years_in_operation: 8,
  industry: 'Technology',
  has_active_bankruptcy: false,
  total_annual_debt: 600_000,
  credit_score: 740,
  loan_amount: 500_000,
  collateral_value: 800_000,
  collateral_type: 'commercial_real_estate',
  late_payments_24m: 0,
  has_contingent_liabilities: false,
  contingent_liability_amount: 0,
};

// ============================================================
// EXPORTS
// ============================================================

/** All shared KB documents (policy + thresholds + market conditions) */
export const SHARED_DOCUMENTS: RawFragment[] = [
  ...POLICY_FRAGMENTS,
  ...THRESHOLD_FRAGMENTS,
  ...MARKET_FRAGMENTS,
];

/** All applicant scenarios for round rotation */
export const APPLICANT_SCENARIOS: ApplicantScenario[] = [
  { id: 'applicant_001', name: 'TechFlow Solutions', fragments: TECHFLOW_FRAGMENTS, data: TECHFLOW_DATA },
  { id: 'applicant_002', name: 'GreenLeaf Manufacturing', fragments: GREENLEAF_FRAGMENTS, data: GREENLEAF_DATA },
  { id: 'applicant_003', name: 'Summit Consulting Group', fragments: SUMMIT_FRAGMENTS, data: SUMMIT_DATA },
];

/** Get all KB fragments for a given applicant scenario (shared docs + applicant) */
export function getKBForScenario(scenario: ApplicantScenario): RawFragment[] {
  return [...SHARED_DOCUMENTS, ...scenario.fragments];
}
