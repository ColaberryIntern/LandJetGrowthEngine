/**
 * leadLocation.ts
 * Resolve a US state (and best-effort city) for a lead from the signals we
 * already have, so territory scoping (Percy = TX, Iowa owner = IA, ...) and the
 * territory map have data to work with.
 *
 * Precedence (cheapest + most reliable first):
 *   1. Phone area code  -> state           (deterministic NANP map, ~free)
 *   2. Company HQ lookup -> state + city   (LLM, uses OPENAI_API_KEY already in prod)
 *   3. none
 *
 * Every resolution carries a `source` and `confidence` so the backfill and the
 * UI can show provenance and we never present a guess as a hard fact.
 *
 * FAILURE MODES (Failure-First Design):
 *  - Upstream (OpenAI) down / slow / 4xx-5xx  -> stateFromCompanyLLM returns null (15s timeout, no throw).
 *  - Malformed / hallucinated LLM output      -> validated against US_STATES; non-US or junk -> null.
 *  - Missing / junk phone                      -> stateFromAreaCode returns null.
 *  - Called concurrently for the same lead     -> pure for area code; LLM is read-only, safe.
 *  This module performs NO writes; callers own persistence + idempotency.
 */

import { recordLlmUsage } from './aiCost';

export const US_STATES: ReadonlySet<string> = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
]);

// Geographic NANP area codes -> US state. Toll-free (8xx) and non-geographic
// codes are intentionally absent so they resolve to null rather than a wrong state.
const STATE_AREA_CODES: Record<string, string[]> = {
  AL: ['205','251','256','334','659','938'],
  AK: ['907'],
  AZ: ['480','520','602','623','928'],
  AR: ['479','501','870'],
  CA: ['209','213','279','310','323','341','350','408','415','424','442','510','530','559','562','619','626','628','650','657','661','669','707','714','747','760','805','818','820','831','840','858','909','916','925','949','951'],
  CO: ['303','719','720','970','983'],
  CT: ['203','475','860','959'],
  DE: ['302'],
  DC: ['202'],
  FL: ['239','305','321','352','386','407','448','561','656','689','727','754','772','786','813','850','863','904','941','954'],
  GA: ['229','404','470','478','678','706','762','770','912','943'],
  HI: ['808'],
  ID: ['208','986'],
  IL: ['217','224','309','312','331','447','464','618','630','708','730','773','779','815','847','872'],
  IN: ['219','260','317','463','574','765','812','930'],
  IA: ['319','515','563','641','712'],
  KS: ['316','620','785','913'],
  KY: ['270','364','502','606','859'],
  LA: ['225','318','337','504','985'],
  ME: ['207'],
  MD: ['240','301','410','443','667'],
  MA: ['339','351','413','508','617','774','781','857','978'],
  MI: ['231','248','269','313','517','586','616','679','734','810','906','947','989'],
  MN: ['218','320','507','612','651','763','952'],
  MS: ['228','601','662','769'],
  MO: ['314','417','557','573','636','660','816'],
  MT: ['406'],
  NE: ['308','402','531'],
  NV: ['702','725','775'],
  NH: ['603'],
  NJ: ['201','551','609','640','732','848','856','862','908','973'],
  NM: ['505','575'],
  NY: ['212','315','332','347','363','516','518','585','607','631','646','680','716','718','838','845','914','917','929','934'],
  NC: ['252','336','472','704','743','828','910','919','980','984'],
  ND: ['701'],
  OH: ['216','220','234','283','326','330','380','419','440','513','567','614','740','937'],
  OK: ['405','539','572','580','918'],
  OR: ['458','503','541','971'],
  PA: ['215','223','267','272','412','445','484','570','582','610','717','724','814','835','878'],
  RI: ['401'],
  SC: ['803','821','839','843','854','864'],
  SD: ['605'],
  TN: ['423','615','629','731','865','901','931'],
  TX: ['210','214','254','281','325','346','361','409','430','432','469','512','682','713','726','737','806','817','830','832','903','915','936','940','945','956','972','979'],
  UT: ['385','435','801'],
  VT: ['802'],
  VA: ['276','434','540','571','686','703','757','804','826','948'],
  WA: ['206','253','360','425','509','564'],
  WV: ['304','681'],
  WI: ['262','274','414','534','608','715','920'],
  WY: ['307'],
};

const AREA_CODE_TO_STATE: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [state, codes] of Object.entries(STATE_AREA_CODES)) {
    for (const c of codes) m[c] = state;
  }
  return m;
})();

export type LocationSource = 'area_code' | 'company_llm' | 'none';

export interface ResolvedLocation {
  state: string | null;
  city: string | null;
  source: LocationSource;
  confidence: number; // 0..1
}

/**
 * Pull the 3-digit area code out of a (messy) US phone string and map it to a
 * state. Handles +1, parens, dashes, spaces, extensions. Returns null when the
 * number is missing, not parseable as a 10-digit US number, or the area code is
 * non-geographic / toll-free.
 */
export function stateFromAreaCode(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  // Drop a leading country code 1 if present (11 digits starting with 1).
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length < 10) return null;
  const area = digits.slice(0, 3);
  return AREA_CODE_TO_STATE[area] ?? null;
}

/**
 * Best-effort company HQ lookup via the LLM. Returns a validated US state (and
 * city when offered) or null. Never throws: any error, timeout, non-US answer,
 * or unparseable output yields null so the caller degrades gracefully.
 */
export async function stateFromCompanyLLM(
  company: string | null | undefined,
  domain?: string | null,
): Promise<{ state: string; city: string | null } | null> {
  const name = (company || '').trim();
  if (!name) return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const userLines = [`Company name: ${name}`, domain ? `Website/domain: ${domain}` : null]
      .filter(Boolean).join('\n');
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You identify the primary US headquarters location of a company. ' +
              'Return ONLY JSON: {"state":"<2-letter US code or null>","city":"<city or null>","confident":<true|false>}. ' +
              'Use the 2-letter USPS code (e.g. TX, IA). If the company is not US-based, or you are not reasonably sure, return state null and confident false. Do not guess.',
          },
          { role: 'user', content: userLines },
        ],
        temperature: 0,
        max_tokens: 60,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    recordLlmUsage({ source: 'company_location', usage: data.usage });
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const state = typeof parsed.state === 'string' ? parsed.state.trim().toUpperCase() : null;
    if (!state || !US_STATES.has(state) || parsed.confident === false) return null;
    const city = typeof parsed.city === 'string' && parsed.city.trim() ? parsed.city.trim() : null;
    return { state, city };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface ResolveLocationInput {
  phone?: string | null;
  company?: string | null;
  domain?: string | null;
}

/**
 * Resolve a lead's location using the precedence above. LLM is opt-in via
 * opts.useLLM so callers control cost (ingestion can enable it per-pull where
 * volume is low; a bulk backfill can gate it behind a batch limit).
 */
export async function resolveLeadLocation(
  input: ResolveLocationInput,
  opts: { useLLM?: boolean } = {},
): Promise<ResolvedLocation> {
  const byArea = stateFromAreaCode(input.phone);
  if (byArea) return { state: byArea, city: null, source: 'area_code', confidence: 0.7 };

  if (opts.useLLM) {
    const byCompany = await stateFromCompanyLLM(input.company, input.domain);
    if (byCompany) return { state: byCompany.state, city: byCompany.city, source: 'company_llm', confidence: 0.6 };
  }

  return { state: null, city: null, source: 'none', confidence: 0 };
}
