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

interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
  senderName?: string;
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

    const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: 'Text', content: input.body },
          toRecipients: [{ emailAddress: { address: input.to } }],
          from: { emailAddress: { name: senderName, address: fromEmail } },
        },
      }),
    });

    if (graphResponse.status === 202 || graphResponse.status === 200) {
      logger.info('Outreach email sent via Graph API', {
        to: input.to,
        from: fromEmail,
        subject: input.subject,
      });
      return { success: true, messageId: `graph-${Date.now()}`, from: fromEmail };
    }

    const errorData = await graphResponse.json().catch(() => ({}));
    const errorMsg = (errorData as any)?.error?.message || `Graph API error: ${graphResponse.status}`;
    logger.error('Graph API email failed', { to: input.to, from: fromEmail, status: graphResponse.status, error: errorMsg });
    return { success: false, error: errorMsg, from: fromEmail };
  } catch (error) {
    const msg = (error as Error).message;
    logger.error('Outreach email failed', { to: input.to, from: fromEmail, error: msg });
    return { success: false, error: msg, from: fromEmail };
  }
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
