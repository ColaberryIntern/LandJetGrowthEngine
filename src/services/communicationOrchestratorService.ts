import { EmailThread } from '../models/EmailThread';
import { logger } from '../config/logger';
import { fetchNewEmails, ParsedEmail } from './gmailService';
import { classifyEmail } from './emailIntelligenceService';
import { scoreEmail, shouldProcess } from './priorityEngineService';
import { resolveThread, createMapping, updateMapping } from './threadResolutionService';
import { generateTodos } from './todoGenerationService';
import * as basecamp from './basecampService';
import { updateFeedback } from './communicationFeedbackService';

export interface PipelineResult {
  fetched: number;
  new_emails: number;
  processed: number;
  skipped: number;
  errors: number;
  details: { gmail_message_id: string; subject: string; action: string; error?: string }[];
}

/**
 * Ingest emails from Gmail and store them in the database.
 * Deduplicates by gmail_message_id.
 */
export async function ingestEmails(lookbackHours: number = 24): Promise<{ fetched: number; new_emails: number }> {
  const emails = await fetchNewEmails(lookbackHours);
  let newCount = 0;

  for (const email of emails) {
    const existing = await EmailThread.findOne({
      where: { gmail_message_id: email.gmail_message_id },
    });

    if (!existing) {
      await EmailThread.create({
        gmail_message_id: email.gmail_message_id,
        gmail_thread_id: email.gmail_thread_id,
        sender: email.sender,
        recipients: email.recipients,
        subject: email.subject,
        body: email.body,
        received_at: email.received_at,
        raw_payload: email.raw_payload,
      });
      newCount++;
    }
  }

  logger.info(`Ingested emails: ${emails.length} fetched, ${newCount} new`);
  return { fetched: emails.length, new_emails: newCount };
}

/**
 * Process all unprocessed emails through the classification + Basecamp pipeline.
 */
export async function processEmails(): Promise<PipelineResult> {
  const unprocessed = await EmailThread.findAll({
    where: { processed: false, skipped: false },
    order: [['received_at', 'ASC']],
  });

  const result: PipelineResult = {
    fetched: 0,
    new_emails: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  for (const email of unprocessed) {
    try {
      // Step 1: Classify with AI
      const classified = await classifyEmail(
        email.subject || '',
        email.body || '',
        email.sender,
      );

      // Step 2: Score priority
      const score = scoreEmail(email.subject || '', email.body || '', classified);

      // Step 3: Update email with classification
      email.classified_data = classified;
      email.priority_score = score;

      // Step 4: Check if should process
      if (!shouldProcess(score)) {
        email.skipped = true;
        email.processed = true;
        await email.save();
        result.skipped++;
        result.details.push({
          gmail_message_id: email.gmail_message_id,
          subject: email.subject || '(no subject)',
          action: 'skipped (low priority)',
        });
        continue;
      }

      // Step 5: Resolve thread (append vs create)
      const existingMapping = await resolveThread(email.gmail_thread_id);

      // Step 6: Generate todos
      const todos = await generateTodos(classified);

      // Step 7: Sync to Basecamp
      let basecampSynced = false;
      try {
        if (existingMapping) {
          // Append to existing topic
          if (existingMapping.basecamp_topic_id) {
            await basecamp.appendComment(
              existingMapping.basecamp_topic_id,
              formatEmailForBasecamp(email),
            );
          }
          // Add new todos to existing todolist
          if (todos.length > 0 && existingMapping.basecamp_todolist_id) {
            await basecamp.addTodos(
              existingMapping.basecamp_todolist_id,
              todos.map(t => ({ content: t.content })),
            );
          }
          await updateMapping(email.gmail_thread_id, { status: 'active' });
          await updateFeedback(existingMapping.id, todos.length);
          basecampSynced = true;
        } else {
          // Create new topic and todolist
          const topic = await basecamp.createTopic(
            classified.topic || email.subject || 'New Thread',
            formatEmailForBasecamp(email),
          );

          let todolistId: string | null = null;
          if (todos.length > 0) {
            const todolist = await basecamp.createTodoList(`Tasks: ${classified.topic}`);
            todolistId = todolist.id;
            await basecamp.addTodos(
              todolistId,
              todos.map(t => ({ content: t.content })),
            );
          }

          const mapping = await createMapping(email.gmail_thread_id, topic.id, todolistId);
          await updateFeedback(mapping.id, todos.length);
          basecampSynced = true;
        }
      } catch (basecampError) {
        logger.error('Basecamp sync failed', {
          gmailMessageId: email.gmail_message_id,
          error: (basecampError as Error).message,
        });
        // Continue processing - email is still classified even if Basecamp sync fails
      }

      email.processed = true;
      await email.save();
      result.processed++;
      result.details.push({
        gmail_message_id: email.gmail_message_id,
        subject: email.subject || '(no subject)',
        action: basecampSynced
          ? `synced to Basecamp (${existingMapping ? 'appended' : 'created'}, ${todos.length} todos)`
          : 'classified (Basecamp sync failed)',
      });
    } catch (error) {
      logger.error('Email processing failed', {
        gmailMessageId: email.gmail_message_id,
        error: (error as Error).message,
      });
      result.errors++;
      result.details.push({
        gmail_message_id: email.gmail_message_id,
        subject: email.subject || '(no subject)',
        action: 'error',
        error: (error as Error).message,
      });
    }
  }

  logger.info('Pipeline completed', {
    processed: result.processed,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}

/**
 * Run the full pipeline: ingest + process.
 */
export async function runPipeline(lookbackHours: number = 24): Promise<PipelineResult> {
  const ingestResult = await ingestEmails(lookbackHours);

  const processResult = await processEmails();
  processResult.fetched = ingestResult.fetched;
  processResult.new_emails = ingestResult.new_emails;

  return processResult;
}

/**
 * Format an email for display in Basecamp.
 */
function formatEmailForBasecamp(email: EmailThread): string {
  const date = email.received_at ? new Date(email.received_at).toLocaleString() : 'Unknown date';
  const classified = email.classified_data;

  let html = `<h2>${classified?.topic || email.subject || 'Email Update'}</h2>`;
  html += `<p><strong>From:</strong> ${email.sender} &nbsp;|&nbsp; <strong>Date:</strong> ${date}</p>`;
  html += `<hr>`;

  // Clean body - convert newlines to paragraphs
  const bodyText = (email.body || '').trim();
  if (bodyText) {
    const paragraphs = bodyText.split(/\n\s*\n/).filter(Boolean);
    html += paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  // Add extracted action items if present
  if (classified?.todos && classified.todos.length > 0) {
    html += `<hr><h3>Action Items</h3><ul>`;
    for (const todo of classified.todos) {
      html += `<li>${todo}</li>`;
    }
    html += `</ul>`;
  }

  return html;
}
