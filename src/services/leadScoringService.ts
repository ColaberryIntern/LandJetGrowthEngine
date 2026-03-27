import { LeadAttributes } from '../models/Lead';

const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
  'zoho.com', 'yandex.com',
];

const EXECUTIVE_TITLE_PATTERNS = [
  /\bCEO\b/i, /\bCTO\b/i, /\bCFO\b/i, /\bCOO\b/i, /\bCMO\b/i, /\bCIO\b/i,
  /\bChief\b/i, /\bPresident\b/i, /\bFounder\b/i, /\bOwner\b/i,
  /\bVP\b/i, /\bVice President\b/i, /\bDirector\b/i, /\bPartner\b/i,
  /\bC-Level\b/i, /\bC-Suite\b/i,
];

export interface ScoreBreakdown {
  total: number;
  corporateEmail: number;
  executiveTitle: number;
  phoneProvided: number;
  evaluatingWithin90Days: number;
  companySizeOver50: number;
  utmPricing: number;
}

export function calculateLeadScore(lead: Partial<LeadAttributes>): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    total: 0,
    corporateEmail: 0,
    executiveTitle: 0,
    phoneProvided: 0,
    evaluatingWithin90Days: 0,
    companySizeOver50: 0,
    utmPricing: 0,
  };

  // Corporate email (non-free domain): +20
  if (lead.email) {
    const domain = lead.email.split('@')[1]?.toLowerCase();
    if (domain && !FREE_EMAIL_DOMAINS.includes(domain)) {
      breakdown.corporateEmail = 20;
    }
  }

  // Executive title (VP, C-level): +20
  if (lead.title) {
    const isExec = EXECUTIVE_TITLE_PATTERNS.some((pattern) => pattern.test(lead.title!));
    if (isExec) {
      breakdown.executiveTitle = 20;
    }
  }

  // Phone provided: +30
  if (lead.phone && lead.phone.trim().length > 0) {
    breakdown.phoneProvided = 30;
  }

  // Evaluating within 90 days: +15
  // This is determined by lifecycle_stage or a flag; for now use lifecycle_stage
  if (lead.lifecycle_stage === 'evaluating') {
    breakdown.evaluatingWithin90Days = 15;
  }

  // Company size 51+: +10
  if (lead.company_size && lead.company_size >= 51) {
    breakdown.companySizeOver50 = 10;
  }

  // UTM source contains 'pricing': +10
  if (lead.utm_source && lead.utm_source.toLowerCase().includes('pricing')) {
    breakdown.utmPricing = 10;
  }

  breakdown.total = Math.min(
    105,
    breakdown.corporateEmail +
      breakdown.executiveTitle +
      breakdown.phoneProvided +
      breakdown.evaluatingWithin90Days +
      breakdown.companySizeOver50 +
      breakdown.utmPricing,
  );

  return breakdown;
}

export function getLeadTemperature(score: number): 'cold' | 'warm' | 'hot' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}
