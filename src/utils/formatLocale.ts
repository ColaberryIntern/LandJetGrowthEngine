import { SystemSetting } from '../models/SystemSetting';

export interface LocalePreferences {
  timezone: string;
  date_format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  currency: string;
  locale: string;
}

export const DEFAULT_LOCALE: LocalePreferences = {
  timezone: 'America/Chicago',
  date_format: 'MM/DD/YYYY',
  currency: 'USD',
  locale: 'en-US',
};

const SETTING_KEY = 'system.locale';

let _cache: { data: LocalePreferences; expiresAt: number } | null = null;
const CACHE_TTL = 60_000;

export async function getLocalePreferences(): Promise<LocalePreferences> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.data;
  try {
    const row = await SystemSetting.findByPk(SETTING_KEY);
    if (!row) {
      _cache = { data: { ...DEFAULT_LOCALE }, expiresAt: Date.now() + CACHE_TTL };
      return _cache.data;
    }
    const val = row.value as any;
    const data: LocalePreferences = {
      timezone: val.timezone ?? DEFAULT_LOCALE.timezone,
      date_format: val.date_format ?? DEFAULT_LOCALE.date_format,
      currency: val.currency ?? DEFAULT_LOCALE.currency,
      locale: val.locale ?? DEFAULT_LOCALE.locale,
    };
    _cache = { data, expiresAt: Date.now() + CACHE_TTL };
    return data;
  } catch {
    return { ...DEFAULT_LOCALE };
  }
}

export async function updateLocalePreferences(updates: Partial<LocalePreferences>): Promise<LocalePreferences> {
  _cache = null;
  const current = await getLocalePreferences();
  const merged: LocalePreferences = { ...current, ...updates };
  await SystemSetting.upsert({
    key: SETTING_KEY,
    value: merged as any,
    description: 'System locale and formatting preferences',
  });
  _cache = { data: merged, expiresAt: Date.now() + CACHE_TTL };
  return merged;
}

export function formatDate(date: Date | string, prefs: LocalePreferences): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleDateString(prefs.locale, { timeZone: prefs.timezone });
  } catch {
    return d.toLocaleDateString('en-US');
  }
}

export function formatDateTime(date: Date | string, prefs: LocalePreferences): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleString(prefs.locale, { timeZone: prefs.timezone });
  } catch {
    return d.toLocaleString('en-US');
  }
}

export function formatCurrency(amount: number, prefs: LocalePreferences): string {
  try {
    return new Intl.NumberFormat(prefs.locale, {
      style: 'currency',
      currency: prefs.currency,
    }).format(amount / 100); // amount in cents
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

export function validateLocale(locale: string): boolean {
  try {
    Intl.NumberFormat(locale);
    return true;
  } catch {
    return false;
  }
}

export function validateTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
