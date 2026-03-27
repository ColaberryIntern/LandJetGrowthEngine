import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../config/logger';

export interface EmailOptions {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  campaignId?: string;
  isTest?: boolean;
  originalTo?: string;
}

export interface EmailResult {
  success: boolean;
  provider: 'mandrill' | 'smtp';
  messageId?: string;
  error?: string;
}

function createMandrillTransport(): Transporter | null {
  const apiKey = process.env.MANDRILL_API_KEY;
  if (!apiKey) return null;

  return nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    secure: false,
    auth: { user: 'apikey', pass: apiKey },
  });
}

function createFallbackTransport(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  if (!host || !port) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Apply test mode: redirect to test email, prepend original address to subject.
 */
export function applyTestMode(
  options: EmailOptions,
  testEmail: string,
): EmailOptions {
  return {
    ...options,
    originalTo: options.to,
    to: testEmail,
    subject: `[TEST -> ${options.to}] ${options.subject}`,
  };
}

/**
 * Send an email via Mandrill (primary) or fallback SMTP.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const from = options.from || process.env.EMAIL_FROM || 'noreply@landjet.com';
  const text = stripHtmlToText(options.html);

  const mailOptions = {
    from,
    to: options.to,
    replyTo: options.replyTo || from,
    subject: options.subject,
    html: options.html,
    text,
    headers: {
      'List-Unsubscribe': `<mailto:${from}?subject=unsubscribe>`,
      ...(options.campaignId ? { 'X-MC-Tags': options.campaignId } : {}),
    },
  };

  // Try Mandrill first
  const mandrillTransport = createMandrillTransport();
  if (mandrillTransport) {
    try {
      const result = await mandrillTransport.sendMail(mailOptions);
      logger.info('Email sent via Mandrill', { to: options.to, messageId: result.messageId });
      return { success: true, provider: 'mandrill', messageId: result.messageId };
    } catch (error) {
      logger.warn('Mandrill send failed, trying fallback', { error: (error as Error).message });
    }
  }

  // Fallback SMTP
  const fallbackTransport = createFallbackTransport();
  if (fallbackTransport) {
    try {
      const result = await fallbackTransport.sendMail(mailOptions);
      logger.info('Email sent via fallback SMTP', { to: options.to, messageId: result.messageId });
      return { success: true, provider: 'smtp', messageId: result.messageId };
    } catch (error) {
      logger.error('Fallback SMTP send failed', { error: (error as Error).message });
      return { success: false, provider: 'smtp', error: (error as Error).message };
    }
  }

  logger.error('No email transport configured');
  return { success: false, provider: 'mandrill', error: 'No email transport configured' };
}
