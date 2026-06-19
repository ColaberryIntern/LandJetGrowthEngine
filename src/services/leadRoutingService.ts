/**
 * Deterministic lead routing.
 *
 * Given a lead, ensure its `vertical` reflects its real industry and that it
 * sits in the campaign matching that vertical. This is the AUTO-ROUTE half of
 * the categorization fix (Ali decision 2026-06-19): machine-ingested leads
 * (Apollo pulls, list imports) are routed to the correct campaign instead of
 * being trusted to land in the right one.
 *
 * IMPORTANT -- machine vs human authority:
 *   - This service trusts `lead.industry` (Apollo data). It is for the
 *     INGESTION path and the reconciliation sweep.
 *   - A MANUAL reassignment by Ryan is authoritative and must NOT be overridden
 *     here. Those leads are stamped `notes.category_source = 'manual'` by the
 *     reassign endpoint and are skipped (see `routeLeadToCorrectCampaign`).
 *     Ryan is frequently *correcting* bad Apollo industry data, so bouncing him
 *     back to the industry-derived campaign would fight the human.
 *
 * Idempotent: `classifyVertical` is pure and campaign resolution is stable, so
 * running this twice on the same lead yields the same campaign_id, the same
 * vertical, and the same review flag.
 *
 * Failure modes:
 *   - Industry unclassifiable  -> action 'unclassified', flagged for review,
 *     left in place (we cannot prove a mismatch, so we do not move it).
 *   - No campaign exists for the lead's vertical -> action 'flagged', left in
 *     place; the pre-send gate blocks it until a campaign exists or a human
 *     intervenes.
 *   - DB write fails -> the Sequelize error propagates to the caller (the
 *     Apollo loop already wraps each lead in try/catch and counts errors).
 */

import { Lead } from '../models/Lead';
import { Campaign } from '../models/Campaign';
import { classifyVertical, campaignVertical, Vertical } from './leadClassification';
import { logger } from '../config/logger';

export type RouteAction = 'kept' | 'routed' | 'flagged' | 'unclassified' | 'manual_skip';

export interface RouteResult {
  action: RouteAction;
  leadVertical: Vertical | null;
  fromCampaignId: string | null;
  toCampaignId: string | null;
  reason: string;
}

export interface CategoryReview {
  status: 'unclassified' | 'no_campaign';
  industry: string | null;
  vertical: Vertical | null;
}

/**
 * Map of canonical vertical -> the campaign that serves it. Built once and
 * passed into `routeLeadToCorrectCampaign` when routing many leads in a loop
 * (Apollo pull, reconciliation) so we do not re-query per lead.
 *
 * When multiple active campaigns map to the same vertical we pick the one with
 * the lexicographically smallest id -- a stable, deterministic tiebreak.
 */
export async function buildVerticalCampaignMap(): Promise<Map<Vertical, Campaign>> {
  const campaigns = await Campaign.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'sequence_steps'],
  });
  const map = new Map<Vertical, Campaign>();
  for (const c of campaigns) {
    const v = campaignVertical(c.name);
    if (!v) continue;
    const existing = map.get(v);
    if (!existing || String(c.id) < String(existing.id)) {
      map.set(v, c);
    }
  }
  return map;
}

function setReview(lead: Lead, review: CategoryReview): void {
  lead.notes = { ...(lead.notes as object || {}), category_review: review };
}

function clearReview(lead: Lead): void {
  const notes = { ...(lead.notes as Record<string, unknown> || {}) };
  delete notes.category_review;
  lead.notes = notes;
}

function isManuallyClassified(lead: Lead): boolean {
  return (lead.notes as any)?.category_source === 'manual';
}

/**
 * Ensure a lead's vertical and campaign reflect its real industry.
 *
 * @param lead          the lead to route (mutated in place)
 * @param opts.campaignMap optional pre-built vertical->campaign map (loop reuse)
 * @param opts.persist  default true; when false, mutate only (caller saves)
 */
export async function routeLeadToCorrectCampaign(
  lead: Lead,
  opts: { campaignMap?: Map<Vertical, Campaign>; persist?: boolean } = {},
): Promise<RouteResult> {
  const persist = opts.persist !== false;
  const fromCampaignId = lead.campaign_id;

  // Human-authoritative leads are never auto-routed.
  if (isManuallyClassified(lead)) {
    return {
      action: 'manual_skip',
      leadVertical: classifyVertical(lead.industry),
      fromCampaignId,
      toCampaignId: fromCampaignId,
      reason: 'Lead was manually categorized by an operator; auto-route skipped.',
    };
  }

  const leadVertical = classifyVertical(lead.industry);

  // Cannot classify -> truthful badge is whatever we can't determine; flag it.
  if (leadVertical === null) {
    setReview(lead, { status: 'unclassified', industry: lead.industry, vertical: null });
    if (persist) await lead.save();
    return {
      action: 'unclassified',
      leadVertical: null,
      fromCampaignId,
      toCampaignId: fromCampaignId,
      reason: `Industry "${lead.industry ?? '(none)'}" does not map to a known vertical.`,
    };
  }

  // The badge always reflects the real industry from here on.
  lead.vertical = leadVertical;

  const campaignMap = opts.campaignMap ?? (await buildVerticalCampaignMap());
  const target = campaignMap.get(leadVertical) ?? null;

  // No campaign serves this vertical -> leave in place, flag, let the gate block.
  if (!target) {
    setReview(lead, { status: 'no_campaign', industry: lead.industry, vertical: leadVertical });
    if (persist) await lead.save();
    logger.warn('Lead vertical has no matching campaign', {
      lead_id: lead.id, vertical: leadVertical, industry: lead.industry,
    });
    return {
      action: 'flagged',
      leadVertical,
      fromCampaignId,
      toCampaignId: fromCampaignId,
      reason: `No active campaign serves vertical "${leadVertical}".`,
    };
  }

  // Already in the right campaign -> nothing to move; clear any stale flag.
  if (fromCampaignId === target.id) {
    clearReview(lead);
    if (persist) await lead.save();
    return {
      action: 'kept',
      leadVertical,
      fromCampaignId,
      toCampaignId: target.id,
      reason: 'Lead already in the campaign matching its industry.',
    };
  }

  // Route to the correct campaign. Clamp the sequence stage to the new
  // campaign's defined steps (mirrors the manual reassign clamp) and reset the
  // timer so the lead surfaces in the correct queue rather than waiting on the
  // old schedule.
  const newMaxSteps = (target.sequence_steps as any[] | null)?.length || 3;
  lead.campaign_id = target.id;
  lead.sequence_stage = Math.min(lead.sequence_stage, newMaxSteps);
  lead.next_action_at = null;
  clearReview(lead);
  if (persist) await lead.save();

  logger.info('Lead auto-routed to matching campaign', {
    lead_id: lead.id, vertical: leadVertical, from: fromCampaignId, to: target.id,
  });
  return {
    action: 'routed',
    leadVertical,
    fromCampaignId,
    toCampaignId: target.id,
    reason: `Routed to "${target.name}" to match industry "${lead.industry}".`,
  };
}
