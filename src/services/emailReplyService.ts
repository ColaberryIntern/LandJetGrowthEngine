import { logger } from '../config/logger';

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_TENANT_ID = process.env.OAUTH_TENANT_ID || '';

async function getGraphToken(): Promise<string> {
  const resp = await fetch(`https://login.microsoftonline.com/${OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  });
  const data = (await resp.json()) as any;
  if (!data.access_token) throw new Error('Failed to get Graph token');
  return data.access_token;
}

export interface InboxEmail {
  id: string;
  subject: string;
  from: string;
  from_email: string;
  received_at: string;
  preview: string;
  is_read: boolean;
  importance: string;
}

export interface DraftReply {
  original_id: string;
  original_subject: string;
  original_from: string;
  draft_subject: string;
  draft_body: string;
  category: string; // 'scheduling' | 'inquiry' | 'follow_up' | 'acknowledgment' | 'requires_review'
  confidence: number; // 0-100
}

/**
 * Fetch recent unread emails from Ryan's inbox.
 */
export async function getRecentInboxEmails(userEmail: string = 'rlandry@landjet.com', limit: number = 20): Promise<InboxEmail[]> {
  const token = await getGraphToken();

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/inbox/messages?$top=${limit}&$select=id,subject,from,receivedDateTime,bodyPreview,isRead,importance&$orderby=receivedDateTime desc&$filter=isRead eq false`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (resp.status === 403) {
    throw new Error('Mail access denied. Ensure Mail.Read application permission is granted in Azure AD.');
  }
  if (!resp.ok) throw new Error(`Mail API error: ${resp.status}`);

  const data = (await resp.json()) as any;
  return (data.value || []).map((m: any) => ({
    id: m.id,
    subject: m.subject || '(no subject)',
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || 'Unknown',
    from_email: m.from?.emailAddress?.address || '',
    received_at: m.receivedDateTime,
    preview: (m.bodyPreview || '').slice(0, 200),
    is_read: m.isRead,
    importance: m.importance || 'normal',
  }));
}

/**
 * Generate AI draft replies for a list of emails.
 */
export async function generateDraftReplies(emails: InboxEmail[]): Promise<DraftReply[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  if (emails.length === 0) return [];

  const emailList = emails.map((e, i) =>
    `[${i}] From: ${e.from} <${e.from_email}>\nSubject: ${e.subject}\nPreview: ${e.preview}`
  ).join('\n\n');

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are drafting email replies for Ryan Landry, CEO of LandJet and Managing Partner at MB Capital Ventures.

For each email, provide:
- draft_subject: Reply subject (usually "Re: [original]")
- draft_body: A concise, professional reply in Ryan's voice. Under 80 words. Sign as "Ryan"
- category: one of "scheduling", "inquiry", "follow_up", "acknowledgment", "requires_review"
- confidence: 0-100 how confident you are this reply is appropriate to auto-send

Rules:
- "scheduling" replies: suggest times or confirm availability (confidence 80-90)
- "acknowledgment" replies: thank you, received, noted (confidence 85-95)
- "inquiry" replies: answer if straightforward, ask for more info if not (confidence 60-80)
- "follow_up" replies: reference prior conversation, move forward (confidence 50-70)
- "requires_review" replies: draft a reply but flag for Ryan to review (confidence 20-50)

NEVER auto-approve replies about: legal matters, investor negotiations, hiring/firing, financial commitments, or anything emotionally sensitive. Those should be "requires_review" with low confidence.

Return JSON array: [{ index, draft_subject, draft_body, category, confidence }]`,
          },
          { role: 'user', content: `Emails needing replies:\n\n${emailList}` },
        ],
        temperature: 0.5,
        max_tokens: 4096,
      }),
    });

    if (!resp.ok) throw new Error('AI reply generation failed');
    const data = (await resp.json()) as any;
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const drafts = JSON.parse(cleaned);

    return drafts.map((d: any) => {
      const email = emails[d.index];
      if (!email) return null;
      return {
        original_id: email.id,
        original_subject: email.subject,
        original_from: `${email.from} <${email.from_email}>`,
        draft_subject: d.draft_subject,
        draft_body: d.draft_body,
        category: d.category,
        confidence: d.confidence,
      };
    }).filter(Boolean) as DraftReply[];
  } catch (error) {
    logger.error('Draft reply generation failed', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Send a reply to a specific email via Graph API.
 */
export async function sendReply(
  userEmail: string,
  originalMessageId: string,
  replyBody: string,
): Promise<{ success: boolean }> {
  const token = await getGraphToken();

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${originalMessageId}/reply`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment: replyBody,
      }),
    },
  );

  if (resp.status === 202 || resp.status === 200) {
    logger.info('Email reply sent', { userEmail, messageId: originalMessageId });
    return { success: true };
  }

  const error = await resp.json().catch(() => ({}));
  logger.error('Email reply failed', { status: resp.status, error });
  return { success: false };
}
