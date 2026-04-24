import { sendOutreachEmail } from './outreachEmailService';
import { logger } from '../config/logger';
import { recordAgentRun } from '../intelligence/agents/agentRegistry';

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

interface CalendarEvent {
  subject: string;
  start: string;
  end: string;
  organizer: string;
  attendees: string[];
  location: string | null;
}

/**
 * Fetch today's calendar events for Ryan from Outlook.
 */
export async function getTodaysEvents(userEmail: string = 'rlandry@landjet.com'): Promise<CalendarEvent[]> {
  const token = await getGraphToken();

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/calendarview?startDateTime=${startOfDay.toISOString()}&endDateTime=${endOfDay.toISOString()}&$select=subject,start,end,organizer,attendees,location&$orderby=start/dateTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (resp.status === 403) {
    throw new Error('Calendar access denied. Ask admin to grant Calendars.Read application permission in Azure AD.');
  }
  if (!resp.ok) throw new Error(`Calendar API error: ${resp.status}`);

  const data = (await resp.json()) as any;
  return (data.value || []).map((e: any) => ({
    subject: e.subject || 'No subject',
    start: e.start?.dateTime || '',
    end: e.end?.dateTime || '',
    organizer: e.organizer?.emailAddress?.name || e.organizer?.emailAddress?.address || '',
    attendees: (e.attendees || []).map((a: any) => a.emailAddress?.name || a.emailAddress?.address || '').filter(Boolean),
    location: e.location?.displayName || null,
  }));
}

/**
 * Generate a morning briefing using AI.
 */
export async function generateMorningBriefing(userEmail: string = 'rlandry@landjet.com'): Promise<{ subject: string; body: string; events_count: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');

  let events: CalendarEvent[];
  try {
    events = await getTodaysEvents(userEmail);
  } catch (error) {
    const msg = (error as Error).message;
    if (msg.includes('Calendar access denied')) {
      return {
        subject: `Morning Briefing - ${new Date().toLocaleDateString()}`,
        body: `Good morning Ryan,\n\nCalendar access is not yet configured. Ask Percy to add "Calendars.Read" application permission to the LandJet Outreach app in Azure AD and grant admin consent.\n\nOnce enabled, this briefing will include your daily meetings, attendee info, and relevant context.\n\nBest,\nLandJet Growth Engine`,
        events_count: 0,
      };
    }
    throw error;
  }

  if (events.length === 0) {
    return {
      subject: `Morning Briefing - ${new Date().toLocaleDateString()} - No Meetings`,
      body: `Good morning Ryan,\n\nYou have no meetings scheduled for today. Clear calendar -- good day to focus on outreach and deal flow.\n\nBest,\nLandJet Growth Engine`,
      events_count: 0,
    };
  }

  const eventList = events.map(e => {
    const startTime = new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    const attendeeList = e.attendees.length > 0 ? e.attendees.join(', ') : 'No attendees listed';
    return `- ${startTime}: ${e.subject}\n  Attendees: ${attendeeList}${e.location ? `\n  Location: ${e.location}` : ''}`;
  }).join('\n\n');

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are generating a morning briefing for Ryan Landry, CEO of LandJet (premium ground transportation) and Managing Partner at MB Capital Ventures (capital advisory). Format a clean, executive-style daily brief. For each meeting, note who he's meeting with and suggest one conversation opener if possible. Keep the entire briefing under 300 words. Start with "Good morning Ryan," and end with a brief priority suggestion for the day.`,
          },
          { role: 'user', content: `Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n\nToday's meetings:\n${eventList}` },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!resp.ok) throw new Error('AI briefing generation failed');
    const data = (await resp.json()) as any;
    const body = (data.choices?.[0]?.message?.content || '').trim();

    recordAgentRun('morning_briefing', { events_count: events.length }).catch(() => {});
    return {
      subject: `Morning Briefing - ${new Date().toLocaleDateString()} - ${events.length} Meeting${events.length !== 1 ? 's' : ''}`,
      body,
      events_count: events.length,
    };
  } catch (error) {
    recordAgentRun('morning_briefing', undefined, 'failed', (error as Error).message).catch(() => {});
    logger.error('Morning briefing AI generation failed', { error: (error as Error).message });
    // Fallback to plain event list
    return {
      subject: `Morning Briefing - ${new Date().toLocaleDateString()} - ${events.length} Meeting${events.length !== 1 ? 's' : ''}`,
      body: `Good morning Ryan,\n\nHere are your meetings today:\n\n${eventList}\n\nHave a great day.\n\nLandJet Growth Engine`,
      events_count: events.length,
    };
  }
}

/**
 * Send the morning briefing email.
 */
export async function sendMorningBriefing(recipientEmail: string = 'rmlandry29@gmail.com'): Promise<{ success: boolean; events_count: number }> {
  const briefing = await generateMorningBriefing();

  const result = await sendOutreachEmail({
    to: recipientEmail,
    subject: briefing.subject,
    body: briefing.body,
    from: 'rlandry@landjet.com',
    senderName: 'LandJet Growth Engine',
  });

  logger.info('Morning briefing sent', { to: recipientEmail, events: briefing.events_count, success: result.success });
  return { success: result.success, events_count: briefing.events_count };
}
