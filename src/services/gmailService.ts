import { google, gmail_v1 } from 'googleapis';
import { logger } from '../config/logger';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'];

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/communication/gmail/callback';

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be configured');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return oauth2Client;
}

function getGmailClient(): gmail_v1.Gmail {
  const auth = getOAuth2Client();
  return google.gmail({ version: 'v1', auth });
}

/**
 * Generate OAuth consent URL for first-time authorization.
 */
export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens.
 */
export async function handleAuthCallback(code: string): Promise<{ refresh_token: string | null | undefined }> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  logger.info('Gmail OAuth tokens obtained', { has_refresh_token: !!tokens.refresh_token });
  return { refresh_token: tokens.refresh_token };
}

/**
 * Decode base64url-encoded Gmail body.
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract plain text body from a Gmail message, handling multipart.
 */
function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    // Prefer text/plain, fallback to text/html
    const textPart = payload.parts.find((p: gmail_v1.Schema$MessagePart) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return decodeBase64Url(textPart.body.data);
    }

    const htmlPart = payload.parts.find((p: gmail_v1.Schema$MessagePart) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      // Strip HTML tags for plain text
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Recurse into nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Extract header value from Gmail message headers.
 */
function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export interface ParsedEmail {
  gmail_message_id: string;
  gmail_thread_id: string;
  sender: string;
  recipients: string[];
  subject: string;
  body: string;
  received_at: Date;
  raw_payload: object;
}

/**
 * Parse a Gmail API message into a structured format.
 */
export function parseEmailMessage(message: gmail_v1.Schema$Message): ParsedEmail {
  const headers = message.payload?.headers || [];
  const sender = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject');
  const dateStr = getHeader(headers, 'Date');
  const body = message.payload ? extractBody(message.payload) : '';

  return {
    gmail_message_id: message.id || '',
    gmail_thread_id: message.threadId || '',
    sender,
    recipients: to ? to.split(',').map(r => r.trim()) : [],
    subject,
    body,
    received_at: dateStr ? new Date(dateStr) : new Date(),
    raw_payload: message as object,
  };
}

/**
 * Fetch new emails from monitored senders within the lookback window.
 */
export async function fetchNewEmails(lookbackHours: number = 24): Promise<ParsedEmail[]> {
  const gmail = getGmailClient();
  const monitoredSenders = (process.env.COMM_MONITORED_SENDERS || '').split(',').filter(Boolean);

  if (monitoredSenders.length === 0) {
    logger.warn('No monitored senders configured (COMM_MONITORED_SENDERS)');
    return [];
  }

  const afterTimestamp = Math.floor((Date.now() - lookbackHours * 60 * 60 * 1000) / 1000);
  const senderQuery = monitoredSenders.map(s => `from:${s.trim()}`).join(' OR ');
  const query = `(${senderQuery}) after:${afterTimestamp}`;

  logger.info('Fetching Gmail messages', { query, lookbackHours });

  const emails: ParsedEmail[] = [];
  let pageToken: string | undefined;

  do {
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken,
    });

    const messages = listResponse.data.messages || [];

    for (const msg of messages) {
      if (!msg.id) continue;

      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const parsed = parseEmailMessage(fullMessage.data);
      emails.push(parsed);
    }

    pageToken = listResponse.data.nextPageToken || undefined;
  } while (pageToken);

  logger.info(`Fetched ${emails.length} emails from Gmail`);
  return emails;
}
