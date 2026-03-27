import { generateMessage } from '../services/aiMessageService';
import { registerAgent, getAgent } from '../intelligence/agents/agentRegistry';
import { logger } from '../config/logger';

export interface PolishInput {
  subject: string;
  body: string;
  leadFirstName: string;
  stepGoal?: string;
  aiTone?: string;
}

export interface PolishOutput {
  subject: string;
  body: string;
  changes_made: string[];
  quality_score: number;
  tokens_used: number;
}

/**
 * The Polisher prompt - ported from the n8n "Final Email Review" node.
 * Preserves the exact behavior: greeting validation, readability, plain-text formatting,
 * CTA timezone validation, output-only-body rule.
 */
function buildPolisherPrompt(emailBody: string, leadFirstName: string): string {
  const now = new Date().toISOString();

  return `<role>
You are an exceptionally meticulous AI email editor, "The Polisher," specializing in high-conversion outreach. Your core function is to transform raw email drafts into perfectly formatted, grammatically flawless, and client-ready plain-text messages. Your attention to detail is paramount.

Goal: To rigorously review, correct, and re-format (ONLY IF NEEDED) the provided email draft to be 100% client-ready. The final output must be flawless, requiring zero manual edits from the user before being sent.
</role>

<inputs>
Email Draft: ${emailBody}
Client First Name: ${leadFirstName}
Reference_Time: The current date and time is ${now} in the America/Chicago (CST/CDT) time zone.
</inputs>

<instructions>
Execute the following steps in order:

1. Opening Line Review (Top Priority):
   - The email MUST begin with a professional greeting: [Greeting Word] [Client's First Name],
   - Examples: "Hello ${leadFirstName},", "Hi ${leadFirstName},"
   - If the greeting is missing or malformed, correct it. Default to "Hello ${leadFirstName},"
   - Ensure one blank line after the greeting.

2. Proofread for Core Errors:
   - Correct all spelling, grammar, and punctuation mistakes.
   - Ensure a consistent and professional tone.

3. Optimize for Readability:
   - ONLY rewrite sentences if they do not meet Flesch-Kincaid readability at 6th-8th grade level.
   - Use active voice and confident, natural tone. Remove corporate jargon and fluff.
   - Verify there is a single, clear call-to-action (CTA).

4. Apply Strict Plain-Text Formatting:
   - One blank line between paragraphs and before/after bulleted lists.
   - Bullet points: hyphen followed by space (e.g., "- First item"). Each on its own line.
   - Remove all bold, italics, underlines, or other text styling.

5. Call-To-Action Validation:
   - Ensure CTA asks for a single, clear action.
   - If specific dates/times suggested, verify they are in the future relative to Reference_Time.
   - Account for time zones (leads may be in EST, reference is CST).
   - If a suggested time has passed, revise to a logical future time.

6. Final Output Check:
   - Output ONLY the email body.
   - No subject line.
   - No signature or sign-off placeholders.

Also return a quality_score (0-100) and a list of changes_made as a JSON suffix after a separator.
</instructions>

<output_format>
Return the polished email body first, then on a new line "---METADATA---" followed by JSON:
{"quality_score": number, "changes_made": ["change1", "change2"]}
</output_format>`;
}

/**
 * Polish an email draft using the n8n "The Polisher" approach.
 */
export async function polish(input: PolishInput): Promise<PolishOutput> {
  // Check if agent is enabled
  const agent = await getAgent('email_polisher');
  if (agent && !agent.enabled) {
    logger.info('Email polisher agent disabled, returning original content');
    return {
      subject: input.subject,
      body: input.body,
      changes_made: [],
      quality_score: 0,
      tokens_used: 0,
    };
  }

  try {
    const polisherPrompt = buildPolisherPrompt(input.body, input.leadFirstName);

    const result = await generateMessage({
      channel: 'email',
      ai_instructions: polisherPrompt,
      tone: input.aiTone || 'professional',
      lead: { name: input.leadFirstName },
    });

    // Parse the response - look for ---METADATA--- separator
    const rawBody = result.body || '';
    const metadataSeparator = '---METADATA---';
    const sepIndex = rawBody.indexOf(metadataSeparator);

    let polishedBody = rawBody;
    let qualityScore = 80;
    let changesMade: string[] = ['Reviewed and polished'];

    if (sepIndex !== -1) {
      polishedBody = rawBody.substring(0, sepIndex).trim();
      try {
        const metaJson = rawBody.substring(sepIndex + metadataSeparator.length).trim();
        const meta = JSON.parse(metaJson);
        qualityScore = meta.quality_score || 80;
        changesMade = meta.changes_made || changesMade;
      } catch {
        // Metadata parsing failed, use defaults
      }
    }

    return {
      subject: input.subject, // Polisher doesn't change subject per n8n spec
      body: polishedBody,
      changes_made: changesMade,
      quality_score: qualityScore,
      tokens_used: result.tokens_used,
    };
  } catch (error) {
    logger.error('Email polisher failed, returning original', { error: (error as Error).message });
    return {
      subject: input.subject,
      body: input.body,
      changes_made: [],
      quality_score: 0,
      tokens_used: 0,
    };
  }
}

/**
 * Register the polisher agent at startup.
 */
export async function registerPolisherAgent() {
  return registerAgent({
    name: 'email_polisher',
    type: 'content_quality',
    department: 'outreach',
    schedule: 'on-demand',
    config: { model: 'gpt-4o', max_tokens: 2048 },
    enabled: true,
  });
}
