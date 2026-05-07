/**
 * LandJet FAQ knowledge base.
 *
 * Source: https://landjet.com/about/faqs (scraped 2026-05-07).
 *
 * Used by the inbound email classifier to recognize FAQ-style inquiries
 * and pull a relevant answer rather than running the trip through the
 * pricing engine. Intentionally embedded as a static array (not a DB
 * table) for v1 -- update by re-scraping and editing this file. If the
 * FAQ list grows past ~30-40 entries or needs admin-UI editing, migrate
 * to a Sequelize model + seed.
 *
 * Lookup is keyword-overlap based for v1 (fast, deterministic, no AI
 * call). The future enhancement is OpenAI embeddings stored alongside
 * each entry.
 */

export interface FaqEntry {
  id: number;
  question: string;
  answer: string;
}

export interface FaqMatch {
  entry: FaqEntry;
  score: number; // 0.0 to 1.0; higher is better
}

export const LANDJET_FAQS: FaqEntry[] = [
  {
    id: 1,
    question: 'Am I able to book multiple trips at once?',
    answer: 'Yes, if you are booking, you can choose a "return trip" option to then book your same trip back to the original destination.',
  },
  {
    id: 2,
    question: 'Can I add gratuity to my reservation?',
    answer: 'If you are booking through our app or website, when you enter the payment information you can choose "pay later" and we can apply a tip for you onto the credit card you are using. You can also give gratuity directly to the pilots.',
  },
  {
    id: 3,
    question: 'What if I need to cancel my trip?',
    answer: 'To receive a full refund, cancellations must be made at least 72 hours before the scheduled trip. If you cancel within 72 hours of the trip, a $200 deposit fee will be charged. Cancellations made less than 24 hours before the trip will incur the full charge.',
  },
  {
    id: 4,
    question: 'Is there a weather policy?',
    answer: "Yes, it is in our discretion if we feel the weather is going to cause any negative effects on the safety of our pilots and customers, we will give a notice prior to the trip and full refund for the trip to allow for a reschedule if needed. Our customers' safety is top priority.",
  },
  {
    id: 5,
    question: 'What if I need to change my reservation?',
    answer: "If there are changes you need made to the current reservation, please email us at sales@landjet.com. If you need to change dates prior to 48 hours' notice, please cancel your current reservation and place a new one.",
  },
  {
    id: 6,
    question: 'Can I make, or work on, Power Point presentations on the TVs?',
    answer: 'Yes. You can use your computer and HDMI port to collaborate on the TV screen or tweak your presentations. You can even collaborate with screen sharing using your ZOOM, Skype, GoToMeeting or Microsoft Teams account (not provided by LandJet).',
  },
  {
    id: 7,
    question: 'Can I entertain clients in a LandJet?',
    answer: 'Having a LandJet can be a great resource for spending time with your clients. Enjoy connecting with clients uninterrupted on the way to/from lunch, dinner, meetings, events, or golf outings.',
  },
  {
    id: 8,
    question: 'How will my conversation be held confidentially?',
    answer: 'Our pilots sign a confidentiality form during training and understand their clients will have confidential information. There is also a privacy divider which the pilots are instructed to keep up during "flight".',
  },
  {
    id: 9,
    question: 'I need to stay overnight. Is that possible?',
    answer: 'Yes. No problem. Our concierge will coordinate with the pilot accordingly. There is a $300 overnight fee to cover dinner and hotel for the pilot which will be included on the bill.',
  },
  {
    id: 10,
    question: 'If my meeting ends early, can we get on the road, or do I have to wait for my scheduled departure time?',
    answer: "Certainly. Your pilot is \"on call\" and ready to leave at your convenience. If your meeting ends early, you can get on the road as soon as you're ready. No need to wait. In contrast, if your meeting runs late, don't stress your departure time.",
  },
  {
    id: 11,
    question: 'Will I have access to the driver/pilot for the day? What if I need to make additional stops or the plan changes?',
    answer: 'Yes. Our pilot will be able to make additional stops, is available for lunch and dinner travel and can make changes to meet your needs. Additional mileage rates will apply.',
  },
  {
    id: 12,
    question: 'Will I need to make a connection at a LandJet terminal?',
    answer: 'Not necessarily. Generally, trips are direct and we do not switch LandJets or pilots. However, if it is a long trip out our pilots cannot do an overnight, we may make a connection. This will generally occur at a designated meeting point, or hotel lobby, where we transfer luggage.',
  },
];

// =====================================================================
// LOOKUP
// =====================================================================

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does',
  'for', 'from', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my',
  'of', 'on', 'or', 'our', 'so', 'that', 'the', 'this', 'to', 'was',
  'we', 'what', 'when', 'where', 'who', 'why', 'will', 'with', 'you',
  'your', 'am', 'able', 'need', 'there', 'any', 'has', 'had', 'they',
  'them', 'their', 'about', 'just', 'want', 'would', 'should', 'could',
  'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Score a query against a single FAQ entry by keyword overlap.
 * Returns a value in [0, 1].
 *
 * Question tokens are weighted 2x answer tokens because the question is
 * the topic anchor; answer text is supporting context. Without this
 * weighting, a query like "what is the overnight policy?" can match the
 * weather FAQ harder than the overnight FAQ because "policy" appears in
 * the weather FAQ's answer.
 */
const QUESTION_WEIGHT = 2;
const ANSWER_WEIGHT = 1;

function scoreEntry(queryTokens: string[], entry: FaqEntry): number {
  if (queryTokens.length === 0) return 0;
  const questionTokens = new Set(tokenize(entry.question));
  const answerTokens = new Set(tokenize(entry.answer));
  if (questionTokens.size === 0 && answerTokens.size === 0) return 0;

  let weightedHits = 0;
  for (const t of queryTokens) {
    if (questionTokens.has(t)) weightedHits += QUESTION_WEIGHT;
    else if (answerTokens.has(t)) weightedHits += ANSWER_WEIGHT;
  }
  // Normalize against max possible (every query token hitting question)
  const maxScore = queryTokens.length * QUESTION_WEIGHT;
  return weightedHits / maxScore;
}

/**
 * Search the FAQ knowledge base for entries matching the query.
 * Returns up to `limit` matches with score >= `threshold`, sorted by score desc.
 */
export function searchFaqs(query: string, opts?: { limit?: number; threshold?: number }): FaqMatch[] {
  const limit = opts?.limit ?? 3;
  const threshold = opts?.threshold ?? 0.3;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored = LANDJET_FAQS
    .map(entry => ({ entry, score: scoreEntry(tokens, entry) }))
    .filter(m => m.score >= threshold)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/**
 * Quick boolean: does this query plausibly match a FAQ?
 * Used by the classifier to decide between FAQ route and quote route.
 */
export function looksLikeFaq(query: string, threshold = 0.4): boolean {
  const matches = searchFaqs(query, { limit: 1, threshold });
  return matches.length > 0;
}
