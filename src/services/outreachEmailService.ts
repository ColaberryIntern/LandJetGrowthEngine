/**
 * Outreach email sending service.
 * Sends emails via Microsoft Graph API using OAuth2 client credentials.
 *
 * Three sender accounts:
 *   rlandry@landjet.com     - Investor outreach (CEO-level)
 *   ryan@landjet.com        - Customer outreach (Tier 1 verticals)
 *   ryan.landry@landjet.com - General/cold outreach
 */

import { logger } from '../config/logger';
import { CommunicationLog } from '../models/CommunicationLog';

interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
  senderName?: string;
  signature?: string;
  // Optional audit fields -- when provided, a row is written to communication_logs
  // on send (success or failure) so we have a full audit trail per lead/campaign.
  lead_id?: number;
  campaign_id?: string | null;
  delivery_mode?: 'live' | 'test';
}

/**
 * Strip AI-generated sign-offs from email body.
 * Removes lines like "Best, Ryan", "- Ryan", "Thanks, Ryan" at the end so the
 * signature from settings is the only sign-off in the email.
 */
function stripSignOff(body: string): string {
  if (!body) return body;
  // Match common closings followed by a name on its own line at the end
  const closings = ['best', 'thanks', 'thank you', 'regards', 'sincerely', 'cheers', 'kind regards', 'warm regards', 'best regards', 'all the best'];
  const closingPattern = closings.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // Pattern: optional closing line + name line at the end
  const re = new RegExp(`\\n+\\s*(?:(?:${closingPattern})[,!.]?\\s*\\n+\\s*)?[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?\\.?\\s*$`, 'i');
  return body.replace(re, '').trimEnd();
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  from: string;
}

const SENDER_MAP: Record<string, string> = {
  investor: process.env.OUTREACH_EMAIL_INVESTOR || 'rlandry@landjet.com',
  customer: process.env.OUTREACH_EMAIL_CUSTOMER || 'ryan@landjet.com',
  general: process.env.OUTREACH_EMAIL_GENERAL || 'ryan.landry@landjet.com',
};

// OAuth2 credentials
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_TENANT_ID = process.env.OAUTH_TENANT_ID || '';

// Token cache
let _tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Determine which sender address to use based on campaign/vertical.
 */
export function getSenderForCampaign(campaignName: string, vertical?: string | null): string {
  const name = (campaignName || '').toLowerCase();
  if (name.includes('investor')) return SENDER_MAP.investor;
  if (name.includes('manufacturing') || name.includes('insurance') || name.includes('healthcare')) return SENDER_MAP.customer;
  if (name.includes('banking') || name.includes('legal') || name.includes('sports') || name.includes('technology') || name.includes('construction')) return SENDER_MAP.customer;
  return SENDER_MAP.general;
}

/**
 * Get OAuth2 access token for Microsoft Graph API.
 */
async function getGraphToken(): Promise<string> {
  // Return cached token if still valid
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${OAUTH_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth2 token request failed: ${response.status} ${err}`);
  }

  const data = (await response.json()) as any;
  if (!data.access_token) {
    throw new Error('No access_token in OAuth2 response');
  }

  // Cache for 50 minutes (tokens expire in 60 min)
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}

/**
 * Send an outreach email via Microsoft Graph API.
 */
export async function sendOutreachEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const fromEmail = input.from || SENDER_MAP.general;
  const senderName = input.senderName || 'Ryan Landry';

  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_TENANT_ID) {
    logger.warn('OAuth2 credentials not configured, email not sent');
    return { success: false, error: 'OAuth2 credentials not configured', from: fromEmail };
  }

  try {
    const token = await getGraphToken();

    // Strip any AI-generated sign-off from the body so signature is the only one
    const cleanBody = stripSignOff(input.body);

    // If signature is provided, build HTML email; otherwise plain text
    let contentType: 'Text' | 'HTML' = 'Text';
    let content = cleanBody;
    if (input.signature && input.signature.trim()) {
      contentType = 'HTML';
      // Convert plain text body to HTML (preserve line breaks) and append signature
      const htmlBody = cleanBody
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      content = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333">${htmlBody}<br><br>${input.signature}</div>`;
    }

    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType, content },
          toRecipients: [{ emailAddress: { address: input.to } }],
          from: { emailAddress: { name: senderName, address: fromEmail } },
        },
      }),
    });

    if (graphResponse.status === 202 || graphResponse.status === 200) {
      const messageId = `graph-${Date.now()}`;
      logger.info('Outreach email sent via Graph API', {
        to: input.to,
        from: fromEmail,
        subject: input.subject,
      });
      await writeCommLog(input, fromEmail, 'sent', messageId, null).catch(e =>
        logger.warn('comm log write failed (sent)', { err: e.message }),
      );
      return { success: true, messageId, from: fromEmail };
    }

    const errorData = await graphResponse.json().catch(() => ({}));
    const errorMsg = (errorData as any)?.error?.message || `Graph API error: ${graphResponse.status}`;
    logger.error('Graph API email failed', { to: input.to, from: fromEmail, status: graphResponse.status, error: errorMsg });
    await writeCommLog(input, fromEmail, 'failed', null, { error: errorMsg, http_status: graphResponse.status }).catch(e =>
      logger.warn('comm log write failed (failed)', { err: e.message }),
    );
    return { success: false, error: errorMsg, from: fromEmail };
  } catch (error) {
    const msg = (error as Error).message;
    logger.error('Outreach email failed', { to: input.to, from: fromEmail, error: msg });
    await writeCommLog(input, fromEmail, 'failed', null, { error: msg, exception: true }).catch(e =>
      logger.warn('comm log write failed (exception)', { err: e.message }),
    );
    return { success: false, error: msg, from: fromEmail };
  }
}

/**
 * Persist a row to communication_logs for every Graph API send attempt.
 * Skips silently if the caller didn't provide lead_id (e.g., one-off ops emails
 * like the morning briefing that aren't tied to a specific lead). Failures
 * never break the send -- they're logged via logger.warn and the email
 * still returns success.
 */
async function writeCommLog(
  input: SendEmailInput,
  fromEmail: string,
  status: 'sent' | 'failed',
  providerMessageId: string | null,
  providerResponse: object | null,
): Promise<void> {
  if (!input.lead_id) return; // ops emails (briefing, KPI report) skip log
  await CommunicationLog.create({
    lead_id: input.lead_id,
    campaign_id: input.campaign_id || null,
    channel: 'email',
    direction: 'outbound',
    delivery_mode: input.delivery_mode || 'live',
    status,
    to_address: input.to,
    from_address: fromEmail,
    subject: input.subject,
    body: input.body,
    provider: 'microsoft_graph',
    provider_message_id: providerMessageId,
    provider_response: providerResponse,
    metadata: { sender_name: input.senderName || null },
  } as any);
}

/**
 * Test the email connection by requesting a Graph API token.
 */
export async function testConnection(fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  try {
    await getGraphToken();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
