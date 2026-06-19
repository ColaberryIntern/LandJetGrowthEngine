/**
 * Deterministic lead categorization -- the single source of truth for "what
 * vertical is this lead, and does it match the campaign it is sitting in".
 *
 * WHY THIS EXISTS (Ryan, recurring -- flagged multiple times):
 * The vertical badge used to be derived from the *campaign name*, never
 * validated against the company's real industry. A remodeling firm (ZINTEX)
 * pulled into the "Banking & Finance" campaign showed "Banking" and received
 * banking messaging; a pharmacy in the "Insurance" campaign got insurance
 * copy. Nothing caught it because the category and the campaign were the same
 * fact echoed back. Categorization now flows from the company's actual
 * industry via `classifyVertical()`, and `categoryMatches()` lets every write
 * and send boundary reject contradictions deterministically.
 *
 * DESIGN CONTRACT:
 *   - Pure functions only. No I/O, no clock, no randomness. Same input always
 *     yields the same output, so the logic is fully unit-testable and the same
 *     lead can be reclassified any number of times with an identical result
 *     (idempotency by construction).
 *   - `classifyVertical(industry)` is the ONLY place a lead's category is
 *     decided from real-world data.
 *   - `campaignVertical(name)` reads the vertical a campaign is *intended* for.
 *     Used to resolve which campaign a vertical routes to and to compare a
 *     lead against its campaign -- never to label a lead.
 */

export const VERTICALS = [
  'Manufacturing',
  'Insurance',
  'Banking',
  'Healthcare',
  'Legal',
  'Sports & Events',
  'Technology',
  'Real Estate, Construction and Engineering',
] as const;

export type Vertical = (typeof VERTICALS)[number];

/**
 * Ordered industry-keyword rules. First match wins, so ORDER MATTERS: more
 * specific verticals are listed before broader ones that could otherwise
 * swallow them (e.g. Insurance before Banking, because an insurance broker is
 * "financial" in a loose sense but must not bucket as Banking).
 *
 * Keywords are matched as case-insensitive substrings against the Apollo
 * `industry` string. Stems are used deliberately ("manufactur" catches both
 * "manufacturing" and "manufacturer"; "pharmaceutic" catches "pharmaceutical"
 * and "pharmaceuticals").
 */
const INDUSTRY_RULES: { vertical: Vertical; keywords: string[] }[] = [
  { vertical: 'Insurance', keywords: ['insurance'] },
  {
    vertical: 'Banking',
    keywords: [
      'banking', 'bank', 'financial', 'finance', 'investment', 'venture capital',
      'private equity', 'capital markets', 'credit', 'wealth', 'accounting',
    ],
  },
  {
    vertical: 'Healthcare',
    keywords: [
      'health', 'hospital', 'medical', 'pharmaceutic', 'pharma', 'biotech',
      'clinic', 'dental', 'nursing', 'wellness', 'physician', 'care',
    ],
  },
  { vertical: 'Legal', keywords: ['law', 'legal', 'attorney', 'litigation'] },
  {
    vertical: 'Real Estate, Construction and Engineering',
    keywords: [
      'real estate', 'construction', 'engineering', 'architect', 'building',
      'property', 'civil', 'remodel', 'contractor', 'infrastructure', 'realty',
      'commercial real estate', 'facilities',
    ],
  },
  {
    vertical: 'Manufacturing',
    keywords: [
      'manufactur', 'industrial', 'machinery', 'automotive', 'aerospace',
      'factory', 'production', 'materials', 'mining', 'plastics', 'chemical',
      'consumer goods', 'food production', 'packaging',
    ],
  },
  {
    vertical: 'Technology',
    keywords: [
      'software', 'information technology', 'it services', 'technology', 'saas',
      'internet', 'computer', 'staffing', 'recruiting', 'telecommunications',
      'semiconductor', 'data', 'cyber',
    ],
  },
  {
    vertical: 'Sports & Events',
    keywords: [
      'sport', 'events', 'entertainment', 'recreation', 'athletic', 'venue',
      'hospitality', 'leisure', 'media',
    ],
  },
];

/**
 * Classify a company's real industry (as returned by Apollo) into one of our
 * canonical verticals. Returns null when the industry is missing or does not
 * map to any known vertical -- callers treat null as "cannot classify", which
 * is NOT the same as a mismatch.
 */
export function classifyVertical(industry: string | null | undefined): Vertical | null {
  if (!industry) return null;
  const needle = industry.toLowerCase().trim();
  if (!needle) return null;
  for (const rule of INDUSTRY_RULES) {
    if (rule.keywords.some((kw) => needle.includes(kw))) {
      return rule.vertical;
    }
  }
  return null;
}

/**
 * The vertical a campaign is intended for, derived from its name. This is the
 * keyword logic that used to live inline in apolloLeadService -- kept ONLY to
 * resolve campaign routing and to compare a lead against its campaign. It is
 * never used to label a lead's category.
 */
export function campaignVertical(campaignName: string | null | undefined): Vertical | null {
  if (!campaignName) return null;
  const name = campaignName.toLowerCase();
  if (name.includes('construction') || name.includes('real estate') || name.includes('engineering')) {
    return 'Real Estate, Construction and Engineering';
  }
  if (name.includes('technology') || name.includes('staffing')) return 'Technology';
  if (name.includes('manufacturing')) return 'Manufacturing';
  if (name.includes('insurance')) return 'Insurance';
  if (name.includes('banking') || name.includes('finance')) return 'Banking';
  if (name.includes('healthcare') || name.includes('health care')) return 'Healthcare';
  if (name.includes('legal')) return 'Legal';
  if (name.includes('sports') || name.includes('events')) return 'Sports & Events';
  return null;
}

export type CategoryStatus = 'match' | 'mismatch' | 'unknown';

export interface CategoryCheck {
  status: CategoryStatus;
  /** The vertical inferred from the company's real industry. */
  leadVertical: Vertical | null;
  /** The vertical the campaign is intended for. */
  campaignVertical: Vertical | null;
}

/**
 * Decide whether a lead's real industry agrees with the campaign it is in.
 *
 *   - 'match'    : both are known and equal -- safe to send.
 *   - 'mismatch' : both are known and DIFFERENT -- this is the failure Ryan
 *                  keeps catching; callers must block or re-route.
 *   - 'unknown'  : either side is unclassifiable, so we cannot prove a
 *                  mismatch. Callers treat this as "needs review", not "block".
 */
export function categoryMatches(
  industry: string | null | undefined,
  campaignName: string | null | undefined,
): CategoryCheck {
  const leadVertical = classifyVertical(industry);
  const cv = campaignVertical(campaignName);
  let status: CategoryStatus;
  if (leadVertical === null || cv === null) {
    status = 'unknown';
  } else {
    status = leadVertical === cv ? 'match' : 'mismatch';
  }
  return { status, leadVertical, campaignVertical: cv };
}
