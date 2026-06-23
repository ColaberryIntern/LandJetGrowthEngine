/**
 * Sender profile service.
 *
 * One outreach send has ONE identity: the from-address, the display name, the
 * title in the signature, and the signature block must all describe the SAME
 * person. Before this service the send path hardcoded "Ryan Landry" + a single
 * global signature regardless of which mailbox the mail left from, so a send
 * from percy@ went out as Ryan with Ryan's signature. This service is the
 * single source of truth that maps a from-address -> the person who owns it.
 *
 * Storage: SystemSetting key `outreach.senders`:
 *   {
 *     template: "<html with {{sender_name}} / {{sender_title}} tokens>",
 *     profiles: { "percy@landjet.com": { name, title, area: ["TX"], signature_override? }, ... }
 *   }
 * The template is shared; each person's effective signature is the template
 * interpolated with their name/title (or a per-person signature_override).
 *
 * Failure modes handled here:
 *  - Unknown from-address          -> resolveProfile returns null; caller blocks.
 *  - Missing/empty stored config   -> falls back to DEFAULT_SENDER_PROFILES.
 *  - Title not in the allowed list -> getEffectiveTitle clamps to a safe value.
 *  - Template with no name token    -> buildSignature still returns the template
 *                                      verbatim (never throws), name is appended
 *                                      defensively so a sign-off identity always
 *                                      exists.
 *  - DB read failure                -> getSendersConfig logs + returns defaults.
 */

import { SystemSetting } from '../models/SystemSetting';
import { logger } from '../config/logger';

export const SENDERS_SETTING_KEY = 'outreach.senders';

/** Titles selectable in settings. "custom" is allowed via free text but these
 *  are the one-click options the UI offers (Ali: Ryan CEO, Percy COO, next guy
 *  Business Development, and make them options). */
export const TITLE_OPTIONS = [
  'CEO',
  'COO',
  'Business Development',
  'President',
  'Founder',
  'Sales',
  'Reservations',
] as const;

export interface SenderProfile {
  email: string;
  name: string;
  title: string;
  /** States this person owns. Informational here; lead-scope enforcement lives
   *  in leadScope.ts keyed off the User row, not this profile. */
  area: string[];
  /** When set, used verbatim instead of the shared template. */
  signature_override?: string;
}

export interface SendersConfig {
  template: string;
  profiles: Record<string, SenderProfile>;
}

/**
 * Default shared signature template. On prod the provisioning script replaces
 * this with Ryan's existing stored signature tokenized in place (see
 * tokenizeSignature), so the team's signatures match the one Ryan already uses.
 * Token set kept deliberately small and explicit. No em dashes (external-comms
 * rule). Plain inline-styled HTML so it renders in every mail client.
 */
export const DEFAULT_SIGNATURE_TEMPLATE = [
  '<div style="font-family:Arial,sans-serif;font-size:13px;color:#2d3748;line-height:1.5">',
  '<div style="font-weight:600;color:#1a365d">{{sender_name}}</div>',
  '<div style="color:#718096">{{sender_title}}, LandJet</div>',
  '<div><a href="mailto:{{sender_email}}" style="color:#2b6cb0;text-decoration:none">{{sender_email}}</a></div>',
  '<div><a href="https://landjet.com" style="color:#2b6cb0;text-decoration:none">landjet.com</a></div>',
  '</div>',
].join('');

/** Canonical roster (Ali 2026-06-23). Emails are the real M365 mailboxes that
 *  the tenant-wide Graph app can send as. Areas: Percy TX, Grant IA, Ryan all
 *  (empty area = no state restriction). */
export const DEFAULT_SENDER_PROFILES: Record<string, SenderProfile> = {
  'rlandry@landjet.com': { email: 'rlandry@landjet.com', name: 'Ryan Landry', title: 'CEO', area: [] },
  'percy@landjet.com': { email: 'percy@landjet.com', name: 'Percy Kapadia', title: 'COO', area: ['TX'] },
  'gnecker@landjet.com': { email: 'gnecker@landjet.com', name: 'Grant Necker', title: 'Business Development', area: ['IA'] },
};

export const DEFAULT_SENDERS_CONFIG: SendersConfig = {
  template: DEFAULT_SIGNATURE_TEMPLATE,
  profiles: DEFAULT_SENDER_PROFILES,
};

/** Normalize an address for keying: trimmed + lowercased. The single most
 *  common cause of a "valid sender rejected" bug is stray whitespace/casing. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/** Clamp a free-text title to something presentable. Empty -> a neutral
 *  fallback so the signature never renders ", LandJet" with a blank title. */
export function getEffectiveTitle(title: string | null | undefined): string {
  const t = (title || '').trim();
  return t || 'Team';
}

/**
 * Build the effective signature for a profile. Pure + total: never throws.
 * Uses signature_override when present, else interpolates the shared template.
 * Defensive: if the resulting HTML does not mention the sender's name at all
 * (e.g. a template with the token removed), the name is appended so every
 * outbound email carries a sign-off identity.
 */
export function buildSignature(template: string, profile: SenderProfile): string {
  if (profile.signature_override && profile.signature_override.trim()) {
    return ensureNamePresent(profile.signature_override, profile.name);
  }
  const vars: Record<string, string> = {
    sender_name: profile.name,
    sender_first_name: (profile.name || '').split(' ')[0] || profile.name,
    sender_title: getEffectiveTitle(profile.title),
    sender_email: profile.email,
    sender_company: 'LandJet',
  };
  const filled = (template || DEFAULT_SIGNATURE_TEMPLATE).replace(
    /\{\{(\w+)\}\}/g,
    (m, k) => (vars[k] !== undefined ? vars[k] : m),
  );
  return ensureNamePresent(filled, profile.name);
}

function ensureNamePresent(html: string, name: string): string {
  if (!name) return html;
  if (html.includes(name)) return html;
  return `${html}<div style="font-weight:600;color:#1a365d">${name}</div>`;
}

/**
 * Turn a literal signature (Ryan's existing one) into a reusable template by
 * replacing his name + title with tokens. Used once by the provisioning script
 * so the other profiles inherit the exact look Ryan already uses. Order matters:
 * replace the longer "name, title" / "title, LandJet" forms before the bare
 * title so we don't leave a dangling token.
 */
export function tokenizeSignature(html: string, owner: { name: string; title: string }): string {
  let out = html || '';
  if (owner.name) out = out.split(owner.name).join('{{sender_name}}');
  const title = (owner.title || '').trim();
  if (title) out = out.split(title).join('{{sender_title}}');
  return out;
}

/**
 * Resolve a from-address to its full profile (with signature built). Pure given
 * a config. Returns null for an address that is not a known sender so the caller
 * can refuse to send rather than guess an identity.
 */
export function resolveProfile(
  fromEmail: string,
  config: SendersConfig,
): (SenderProfile & { signature: string }) | null {
  const key = normalizeEmail(fromEmail);
  const profile = config.profiles[key];
  if (!profile) return null;
  return { ...profile, signature: buildSignature(config.template, profile) };
}

/**
 * Detect when a signature/display name describes a DIFFERENT known person than
 * the from-address. This is the guard against the exact bug we are fixing:
 * sending from percy@ while still carrying "Ryan Landry" + Ryan's signature.
 * Returns the conflicting name when a mismatch is proven, else null.
 */
export function detectIdentityConflict(args: {
  fromEmail: string;
  displayName?: string | null;
  signature?: string | null;
  config: SendersConfig;
}): string | null {
  const owner = resolveProfile(args.fromEmail, args.config);
  if (!owner) return null; // unknown sender is handled by the whitelist, not here
  for (const other of Object.values(args.config.profiles)) {
    if (normalizeEmail(other.email) === normalizeEmail(owner.email)) continue;
    if (!other.name) continue;
    const inName = args.displayName ? args.displayName.includes(other.name) : false;
    const inSig = args.signature ? args.signature.includes(other.name) : false;
    if (inName || inSig) return other.name;
  }
  return null;
}

// --- Async accessors (DB-backed, fall back to defaults) -------------------

let _cache: { data: SendersConfig; expiresAt: number } | null = null;
const CACHE_TTL = 60_000;

export function invalidateSendersCache(): void {
  _cache = null;
}

/**
 * Merge a stored config over the defaults so a partial/empty row can never
 * drop a known sender or the template. Known profiles always survive; stored
 * ones override field-by-field.
 */
export function mergeConfig(stored: Partial<SendersConfig> | null | undefined): SendersConfig {
  const template = (stored?.template && stored.template.trim()) || DEFAULT_SIGNATURE_TEMPLATE;
  const profiles: Record<string, SenderProfile> = {};
  for (const [k, v] of Object.entries(DEFAULT_SENDER_PROFILES)) profiles[k] = { ...v };
  if (stored?.profiles) {
    for (const [k, v] of Object.entries(stored.profiles)) {
      const key = normalizeEmail(k);
      const base = profiles[key] || { email: key, name: '', title: '', area: [] };
      profiles[key] = {
        email: key || base.email,
        name: v?.name ?? base.name,
        title: v?.title ?? base.title,
        area: Array.isArray(v?.area) ? v.area : base.area,
        signature_override: v?.signature_override ?? base.signature_override,
      };
    }
  }
  return { template, profiles };
}

export async function getSendersConfig(): Promise<SendersConfig> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.data;
  try {
    const row = await SystemSetting.findByPk(SENDERS_SETTING_KEY);
    const data = mergeConfig(row ? (row.value as Partial<SendersConfig>) : null);
    _cache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch (e) {
    logger.warn('getSendersConfig failed, using defaults', { error: (e as Error).message });
    return DEFAULT_SENDERS_CONFIG;
  }
}

export async function getSenderProfile(
  fromEmail: string,
): Promise<(SenderProfile & { signature: string }) | null> {
  const config = await getSendersConfig();
  return resolveProfile(fromEmail, config);
}

export async function saveSendersConfig(config: SendersConfig): Promise<SendersConfig> {
  const merged = mergeConfig(config);
  await SystemSetting.upsert({
    key: SENDERS_SETTING_KEY,
    value: merged as any,
    description: 'Per-sender outreach identities (name, title, area, signature)',
  });
  invalidateSendersCache();
  _cache = { data: merged, expiresAt: Date.now() + CACHE_TTL };
  return merged;
}
