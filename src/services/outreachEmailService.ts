/**
 * Outreach email sending service.
 * Sends emails via Microsoft 365 SMTP from LandJet domain addresses.
 *
 * Three sender accounts:
 *   rlandry@landjet.com     - Investor outreach (CEO-level)
 *   ryan@landjet.com        - Customer outreach (Tier 1 verticals)
 *   ryan.landry@landjet.com - General/cold outreach
 */

import * as nodemailer from 'nodemailer';
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
 * Create a nodemailer transporter for a specific sender address.
 */
function createTransporter(fromEmail: string) {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: fromEmail,
      pass: process.env.OUTREACH_EMAIL_PASSWORD || '',
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false,
    },
  });
}

/**
 * Send an outreach email via Microsoft 365 SMTP.
 */
export async function sendOutreachEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const fromEmail = input.from || SENDER_MAP.general;
  const senderName = input.senderName || 'Ryan Landry';

  if (!process.env.OUTREACH_EMAIL_PASSWORD) {
    logger.warn('OUTREACH_EMAIL_PASSWORD not set, email not sent');
    return { success: false, error: 'Email password not configured', from: fromEmail };
  }

  try {
    const transporter = createTransporter(fromEmail);

    const result = await transporter.sendMail({
      from: `"${senderName}" <${fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });

    logger.info('Outreach email sent', {
      to: input.to,
      from: fromEmail,
      subject: input.subject,
      messageId: result.messageId,
    });

    return { success: true, messageId: result.messageId, from: fromEmail };
  } catch (error) {
    const msg = (error as Error).message;
    logger.error('Outreach email failed', { to: input.to, from: fromEmail, error: msg });
    return { success: false, error: msg, from: fromEmail };
  }
}

/**
 * Test the SMTP connection for a specific sender address.
 */
export async function testConnection(fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  const email = fromEmail || SENDER_MAP.investor;
  try {
    const transporter = createTransporter(email);
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
