/**
 * Weekly Friday pre-call briefing service.
 *
 * Locked in 2026-06-17 (BC todo 10008641010 in LandJet bucket 46699826).
 *
 * Fires every Friday 9:15 AM CT from pipelineAutoRunner.ts. Pulls live data
 * from prod, renders the v3 Ryan outreach audit HTML, rasterizes the six SVG
 * charts to PNG (Gmail strips inline svg), sends via Mandrill SMTP to the
 * three recipients with each chart embedded as a cid: inline attachment.
 *
 * Failure modes:
 *  - MANDRILL_API_KEY missing -> throws, structured log warns operator
 *  - Sharp rasterization fails for a single SVG -> that chart stays inline (may
 *    not render in Gmail), other charts still ship
 *  - SMTP send fails -> throws; caller in pipelineAutoRunner catches and logs
 *
 * Idempotent at the BC-comment level: each weekly send posts a fresh comment
 * on the recurring todo with subject + recipients + Mandrill message id, so
 * re-running on the same day creates a duplicate comment but no double email
 * unless explicitly triggered twice.
 */

import { QueryTypes } from 'sequelize';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { logger } from '../config/logger';
import { getSequelize } from '../config/database';
import { BriefingData, renderBriefingHtml } from './weeklyBriefingRenderer';

const DEFAULT_RECIPIENTS = ['ali@colaberry.com', 'rlandry@landjet.com', 'pkapadia@landjet.com'];
const FROM_HEADER = '"Ali Muwwakkil" <ali@colaberry.com>';
const REPLY_TO = 'ali@colaberry.com';
const BC_TODO_ID = 10008641010;
const BC_BUCKET_ID = 46699826;
const BC_ACCOUNT = '3945211';

const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family:arial,sans-serif;font-size:14px;color:#2d3748;border-left:3px solid #1a365d;padding-left:14px;margin-top:24px"><tr><td>
<div style="font-weight:700;font-size:16px;color:#1a365d">Ali Muwwakkil</div>
<div style="color:#2b6cb0;font-weight:600">Managing Director / AI Systems Architect</div>
<div style="color:#718096">Colaberry Inc.</div>
<div style="margin-top:10px;color:#2d3748">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
<div style="color:#2d3748"><a href="mailto:ali@colaberry.com" style="color:#2b6cb0;text-decoration:none">ali@colaberry.com</a> &nbsp; <a href="https://enterprise.colaberry.ai" style="color:#2b6cb0;text-decoration:none">enterprise.colaberry.ai</a></div>
</td></tr></table>`;

const SIG_TEXT = `Ali Muwwakkil\nManaging Director / AI Systems Architect\nColaberry Inc.\n\n200 Chisholm Place, Suite 200, Plano, TX 75075\nali@colaberry.com  |  enterprise.colaberry.ai`;

function stripEmDashes(s: string): string {
  return s.replace(/—/g, '-').replace(/–/g, '-');
}

export async function collectBriefingData(): Promise<BriefingData> {
  const sequelize = getSequelize();

  const campaigns = await sequelize.query<{ name: string; sends: string; recipients: string; first_send: string; last_send: string }>(
    `SELECT c.name, COUNT(cl.id)::text AS sends, COUNT(DISTINCT cl.to_address)::text AS recipients,
            MIN(cl.created_at)::date::text AS first_send, MAX(cl.created_at)::date::text AS last_send
     FROM campaigns c
     JOIN communication_logs cl ON cl.campaign_id = c.id
     WHERE cl.direction = 'outbound'
     GROUP BY c.name
     ORDER BY COUNT(cl.id) DESC`,
    { type: QueryTypes.SELECT },
  );

  const dailyCommLogs = await sequelize.query<{ day: string; count: string }>(
    `SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS day, COUNT(*)::text AS count
     FROM communication_logs WHERE direction = 'outbound'
     GROUP BY day ORDER BY day`,
    { type: QueryTypes.SELECT },
  );

  const dailyLeadTouches = await sequelize.query<{ day: string; count: string }>(
    `SELECT (last_contacted_at AT TIME ZONE 'America/Chicago')::date::text AS day, COUNT(*)::text AS count
     FROM leads WHERE last_contacted_at IS NOT NULL
     GROUP BY day ORDER BY day`,
    { type: QueryTypes.SELECT },
  );

  const hourCT = await sequelize.query<{ hour: number; count: string }>(
    `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Chicago')::int AS hour, COUNT(*)::text AS count
     FROM communication_logs WHERE direction = 'outbound'
     GROUP BY hour ORDER BY hour`,
    { type: QueryTypes.SELECT },
  );

  const touchedPipeline = await sequelize.query<{ stage: string; count: string }>(
    `SELECT pipeline_stage::text AS stage, COUNT(*)::text AS count
     FROM leads
     WHERE email IN (SELECT to_address FROM communication_logs WHERE direction = 'outbound')
        OR last_contacted_at IS NOT NULL
     GROUP BY stage ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT },
  );

  const senders = await sequelize.query<{ from_address: string; count: string }>(
    `SELECT from_address, COUNT(*)::text AS count FROM communication_logs
     WHERE direction = 'outbound' GROUP BY from_address ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT },
  );

  // Channel split. LinkedIn touches are NOT logged in communication_logs (the
  // model only supports email/sms/voice); a LinkedIn "Mark Done" only stamps
  // last_contacted_at on the lead. So "emailed" = leads whose email received an
  // outbound email send; "LinkedIn-only" = leads touched (last_contacted_at)
  // that never got an email. This is the email-vs-LinkedIn breakdown Ali asked for.
  const [channelRow] = await sequelize.query<{ leads_emailed: string; leads_linkedin_only: string }>(
    `SELECT
       (SELECT COUNT(*)::text FROM leads
          WHERE email IN (SELECT to_address FROM communication_logs WHERE direction='outbound' AND channel='email')) AS leads_emailed,
       (SELECT COUNT(*)::text FROM leads
          WHERE last_contacted_at IS NOT NULL
            AND email NOT IN (SELECT to_address FROM communication_logs WHERE direction='outbound')) AS leads_linkedin_only`,
    { type: QueryTypes.SELECT },
  );

  // Who replied: distinct leads with a validated inbound row (written by
  // replyIngestionService), most recent first, for the "Replies" section.
  const responders = await sequelize.query<{ name: string; company: string | null; subject: string | null; body: string | null; day: string; booked: boolean }>(
    `SELECT DISTINCT ON (cl.lead_id)
            TRIM(l.first_name || ' ' || l.last_name) AS name,
            l.company AS company,
            cl.subject AS subject,
            cl.body AS body,
            cl.created_at::date::text AS day,
            EXISTS (SELECT 1 FROM reservation_quotes rq WHERE LOWER(rq.from_email) = LOWER(l.email)) AS booked
     FROM communication_logs cl JOIN leads l ON l.id = cl.lead_id
     WHERE cl.direction = 'inbound'
     ORDER BY cl.lead_id, cl.created_at DESC`,
    { type: QueryTypes.SELECT },
  );

  // --- Per-channel splits (blue=email / teal=LinkedIn across all charts) ---
  // "emailed" = lead got an outbound email; "LinkedIn-only" = touched (advanced
  // via LinkedIn, stamping last_contacted_at) but never emailed.
  const EMAILED = `email IN (SELECT to_address FROM communication_logs WHERE direction='outbound' AND channel='email')`;
  const LINKEDIN_ONLY = `last_contacted_at IS NOT NULL AND email NOT IN (SELECT to_address FROM communication_logs WHERE direction='outbound')`;
  const TOUCHED = `(last_contacted_at IS NOT NULL OR email IN (SELECT to_address FROM communication_logs WHERE direction='outbound'))`;

  const campaignChannel = await sequelize.query<{ name: string; emailed: string; linkedin_only: string }>(
    `SELECT COALESCE(c.name, '(no campaign)') AS name,
       COUNT(*) FILTER (WHERE l.${EMAILED})::text AS emailed,
       COUNT(*) FILTER (WHERE l.${LINKEDIN_ONLY})::text AS linkedin_only
     FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
     WHERE ${TOUCHED}
     GROUP BY c.name ORDER BY COUNT(*) DESC LIMIT 12`,
    { type: QueryTypes.SELECT },
  );

  const pipelineChannel = await sequelize.query<{ stage: string; emailed: string; linkedin_only: string }>(
    `SELECT pipeline_stage::text AS stage,
       COUNT(*) FILTER (WHERE ${EMAILED})::text AS emailed,
       COUNT(*) FILTER (WHERE ${LINKEDIN_ONLY})::text AS linkedin_only
     FROM leads l WHERE ${TOUCHED}
     GROUP BY pipeline_stage ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT },
  );

  const dailyLinkedIn = await sequelize.query<{ day: string; count: string }>(
    `SELECT (last_contacted_at AT TIME ZONE 'America/Chicago')::date::text AS day, COUNT(*)::text AS count
     FROM leads l WHERE l.${LINKEDIN_ONLY}
     GROUP BY day ORDER BY day`,
    { type: QueryTypes.SELECT },
  );

  const hourLinkedIn = await sequelize.query<{ hour: number; count: string }>(
    `SELECT EXTRACT(HOUR FROM last_contacted_at AT TIME ZONE 'America/Chicago')::int AS hour, COUNT(*)::text AS count
     FROM leads l WHERE l.${LINKEDIN_ONLY}
     GROUP BY hour ORDER BY hour`,
    { type: QueryTypes.SELECT },
  );

  const [totalsRow] = await sequelize.query<{
    total_sends: string; total_inbound: string; total_active: string;
    total_reachable: string; unique_recipients: string; unique_responded: string;
    active_campaigns: string; total_touched: string;
    first_send: string | null; last_send: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM communication_logs WHERE direction='outbound') AS total_sends,
       (SELECT COUNT(*)::text FROM communication_logs WHERE direction='inbound') AS total_inbound,
       (SELECT COUNT(*)::text FROM leads WHERE status='active') AS total_active,
       (SELECT COUNT(*)::text FROM leads WHERE status='active' AND email IS NOT NULL) AS total_reachable,
       (SELECT COUNT(DISTINCT to_address)::text FROM communication_logs WHERE direction='outbound') AS unique_recipients,
       (SELECT COUNT(DISTINCT lead_id)::text FROM communication_logs WHERE direction='inbound') AS unique_responded,
       (SELECT COUNT(*)::text FROM campaigns WHERE approval_status='live') AS active_campaigns,
       (SELECT COUNT(*)::text FROM leads WHERE last_contacted_at IS NOT NULL OR email IN (SELECT to_address FROM communication_logs WHERE direction='outbound')) AS total_touched,
       (SELECT MIN(created_at)::date::text FROM communication_logs WHERE direction='outbound') AS first_send,
       (SELECT MAX(created_at)::date::text FROM communication_logs WHERE direction='outbound') AS last_send`,
    { type: QueryTypes.SELECT },
  );

  const lastSend = totalsRow.last_send || new Date().toISOString().slice(0, 10);
  const daysSinceLastSend = Math.max(0, Math.floor((Date.now() - new Date(lastSend + 'T12:00:00').getTime()) / 86400000));
  const firstSend = totalsRow.first_send || lastSend;

  // Replies come from the validated inbound rows persisted by replyIngestionService
  // (Graph mailbox read + thread/vendor validation lives there now). The briefing
  // just reads what was recorded -- a single source of truth.
  const hasInbound = +totalsRow.total_inbound > 0;

  return {
    totalSends: +totalsRow.total_sends,
    totalInbound: +totalsRow.total_inbound,
    totalActive: +totalsRow.total_active,
    totalReachable: +totalsRow.total_reachable,
    uniqueRecipients: +totalsRow.unique_recipients,
    uniqueRespondedRecipients: +totalsRow.unique_responded,
    replySource: hasInbound ? 'comm_logs' : 'unavailable',
    responders: responders.map(r => ({ name: r.name || '(unknown)', company: r.company, subject: r.subject, body: r.body, day: r.day, booked: !!r.booked })),
    leadsEmailed: +channelRow.leads_emailed,
    leadsLinkedInOnly: +channelRow.leads_linkedin_only,
    totalTouchedLeads: +totalsRow.total_touched,
    activeCampaigns: +totalsRow.active_campaigns,
    firstSend,
    lastSend,
    daysSinceLastSend,
    campaigns: campaigns.map(c => ({ name: c.name, sends: +c.sends, recipients: +c.recipients, firstSend: c.first_send, lastSend: c.last_send })),
    dailyCommLogs: dailyCommLogs.map(r => ({ day: r.day, count: +r.count })),
    dailyLeadTouches: dailyLeadTouches.map(r => ({ day: r.day, count: +r.count })),
    hourCT: hourCT.map(r => ({ hour: r.hour, count: +r.count })),
    touchedPipeline: touchedPipeline.map(r => ({ stage: r.stage, count: +r.count })),
    senders: senders.map(r => ({ from: r.from_address, count: +r.count })),
    campaignChannel: campaignChannel.map(r => ({ name: r.name, emailed: +r.emailed, linkedinOnly: +r.linkedin_only })),
    pipelineChannel: pipelineChannel.map(r => ({ stage: r.stage, emailed: +r.emailed, linkedinOnly: +r.linkedin_only })),
    dailyEmail: dailyCommLogs.map(r => ({ day: r.day, count: +r.count })),
    dailyLinkedIn: dailyLinkedIn.map(r => ({ day: r.day, count: +r.count })),
    hourEmail: hourCT.map(r => ({ hour: r.hour, count: +r.count })),
    hourLinkedIn: hourLinkedIn.map(r => ({ hour: r.hour, count: +r.count })),
  };
}

async function rasterizeSvgs(html: string): Promise<{ html: string; attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> }> {
  const re = /<svg\b[^>]*>[\s\S]*?<\/svg>/g;
  const matches = [...html.matchAll(re)];
  if (matches.length === 0) return { html, attachments: [] };
  const attachments: Array<{ filename: string; content: Buffer; cid: string; contentType: string }> = [];
  let modifiedHtml = html;
  for (let i = 0; i < matches.length; i++) {
    const svgRaw = matches[i][0];
    const cid = `chart-${String(i + 1).padStart(2, '0')}`;
    try {
      const pngBuf = await sharp(Buffer.from(svgRaw, 'utf8'), { density: 200 })
        .resize({ width: 1400, withoutEnlargement: false })
        .png({ compressionLevel: 9 })
        .toBuffer();
      attachments.push({ filename: `${cid}.png`, content: pngBuf, cid, contentType: 'image/png' });
      const img = `<img src="cid:${cid}" alt="chart ${i + 1}" style="display:block;max-width:100%;height:auto;border:0" width="700">`;
      modifiedHtml = modifiedHtml.replace(svgRaw, img);
    } catch (e) {
      logger.warn('weeklyBriefing.rasterize: svg failed, leaving inline', { svg_index: i + 1, error: (e as Error).message });
    }
  }
  return { html: modifiedHtml, attachments };
}

async function postBcComment(html: string): Promise<string | null> {
  const token = (process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '').trim();
  if (!token) {
    logger.warn('weeklyBriefing.bcComment skipped: BASECAMP_ACCESS_TOKEN not set');
    return null;
  }
  try {
    const r = await fetch(`https://3.basecampapi.com/${BC_ACCOUNT}/buckets/${BC_BUCKET_ID}/recordings/${BC_TODO_ID}/comments.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'LandJet weeklyBriefingService',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: html }),
    });
    if (!r.ok) {
      logger.warn('weeklyBriefing.bcComment failed', { status: r.status });
      return null;
    }
    const j = await r.json() as { app_url?: string };
    return j.app_url || null;
  } catch (e) {
    logger.warn('weeklyBriefing.bcComment threw (non-fatal)', { error: (e as Error).message });
    return null;
  }
}

export async function sendWeeklyBriefing(now: Date = new Date()): Promise<{ messageId: string; recipients: string[]; chartCount: number; bcCommentUrl: string | null }> {
  if (!process.env.MANDRILL_API_KEY) throw new Error('MANDRILL_API_KEY env var required');

  const data = await collectBriefingData();
  const html = stripEmDashes(renderBriefingHtml(data, now));
  const { html: htmlWithCids, attachments } = await rasterizeSvgs(html);
  const finalHtml = htmlWithCids.includes('</body>')
    ? htmlWithCids.replace('</body>', SIG_HTML + '</body>')
    : htmlWithCids + SIG_HTML;

  const recipients = (process.env.WEEKLY_BRIEFING_RECIPIENTS || DEFAULT_RECIPIENTS.join(',')).split(',').map(s => s.trim()).filter(Boolean);

  const text = stripEmDashes(`LandJet Growth Engine - Friday Pre-Call Briefing\n\nWindow: ${data.firstSend} to ${data.lastSend}\nLogged sends: ${data.totalSends}\nLeads touched: ${data.totalTouchedLeads}\nReplies received: ${data.totalInbound}\nLive campaigns: ${data.activeCampaigns}\nPool reach: ${data.totalReachable > 0 ? ((data.uniqueRecipients / data.totalReachable) * 100).toFixed(2) : '0.00'}%\nDays since last send: ${data.daysSinceLastSend}\n\nOpen the HTML version for the full report with charts and takeaways.\n\n${SIG_TEXT}`);

  const subject = `Friday briefing: ${data.totalSends} sends, ${data.totalInbound} replies, ${data.totalReachable > 0 ? ((data.uniqueRecipients / data.totalReachable) * 100).toFixed(2) : '0.00'}% pool reach`;

  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com', port: 587,
    auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
  });

  const sent = await transport.sendMail({
    from: FROM_HEADER,
    to: recipients,
    bcc: 'ali@colaberry.com',
    replyTo: REPLY_TO,
    subject,
    html: finalHtml,
    text,
    attachments,
    headers: { 'X-MC-Track': 'opens,clicks', 'X-MC-AutoText': 'false' },
  });

  const bcComment = await postBcComment(
    `<div><strong>Friday briefing delivered</strong></div>
<div style="margin-top:8px"><strong>Subject:</strong> ${subject}</div>
<div style="margin-top:4px"><strong>To:</strong> ${recipients.join(', ')}</div>
<div style="margin-top:4px"><strong>Mandrill:</strong> <code>${sent.messageId}</code></div>
<div style="margin-top:4px"><strong>Snapshot:</strong> ${data.firstSend} to ${data.lastSend} | ${data.totalSends} sends | ${data.totalInbound} replies | ${data.activeCampaigns} live campaigns</div>
<div style="margin-top:4px;font-size:11px;color:#666">Sent ${now.toISOString()} via weeklyBriefingService.ts</div>`,
  );

  return { messageId: sent.messageId, recipients, chartCount: attachments.length, bcCommentUrl: bcComment };
}
