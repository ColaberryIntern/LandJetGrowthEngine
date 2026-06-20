/**
 * googleDistance.ts — real road mileage via the Google Distance Matrix API
 * (audit gap G16). Gated on GOOGLE_MAPS_API_KEY: with no key it returns null
 * and callers fall back to the prior miles=0 behaviour, so this is safe to ship
 * before the key is provisioned. Fail-soft (timeout, never throws).
 */
import { logger } from '../config/logger';

const METERS_PER_MILE = 1609.344;

function key(): string {
  return process.env.GOOGLE_MAPS_API_KEY || '';
}

export function distanceConfigured(): boolean {
  return Boolean(key());
}

/** One-way driving miles between two addresses, or null if unavailable. */
export async function roadMilesBetween(origin: string, destination: string): Promise<number | null> {
  const k = key();
  if (!k || !origin || !destination) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const url =
      'https://maps.googleapis.com/maps/api/distancematrix/json' +
      `?units=imperial&origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${k}`;
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) return null;
    const d = (await r.json()) as any;
    const el = d?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== 'OK' || typeof el.distance?.value !== 'number') return null;
    return +(el.distance.value / METERS_PER_MILE).toFixed(1);
  } catch (e) {
    logger.warn('roadMilesBetween failed (non-fatal)', { error: (e as Error).message });
    return null;
  } finally {
    clearTimeout(t);
  }
}
