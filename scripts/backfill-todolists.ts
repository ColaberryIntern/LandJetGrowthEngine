/**
 * Backfill todolists for all processed emails that have todos but no todolist.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getSequelize } from '../src/config/database';
import { initModels } from '../src/models';
import { EmailThread } from '../src/models/EmailThread';
import { TopicThreadMap } from '../src/models/TopicThreadMap';
import * as basecamp from '../src/services/basecampService';

async function main() {
  console.log('\n=== Backfilling Todolists ===\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  initModels(sequelize);

  // Get all processed emails with todos
  const emails = await EmailThread.findAll({
    where: { processed: true, skipped: false },
    order: [['received_at', 'ASC']],
  });

  for (const email of emails) {
    const classified = email.classified_data;
    if (!classified || !classified.todos || classified.todos.length === 0) {
      console.log(`[skip] ${email.subject} — no todos`);
      continue;
    }

    // Find the thread mapping
    const mapping = await TopicThreadMap.findOne({
      where: { gmail_thread_id: email.gmail_thread_id },
    });

    if (!mapping) {
      console.log(`[skip] ${email.subject} — no Basecamp mapping`);
      continue;
    }

    if (mapping.basecamp_todolist_id) {
      console.log(`[skip] ${email.subject} — todolist already exists`);
      continue;
    }

    // Create todolist named after the topic
    const topicName = classified.topic || email.subject || 'Action Items';
    console.log(`\n[create] Todolist: "${topicName}"`);

    const todolist = await basecamp.createTodoList(topicName);
    console.log(`  Todolist ID: ${todolist.id}`);

    // Add all todos
    for (const todo of classified.todos) {
      const result = await basecamp.addTodo(todolist.id, todo);
      console.log(`  + Todo: "${todo}" (ID: ${result.id})`);
    }

    // Update the mapping
    mapping.basecamp_todolist_id = todolist.id;
    mapping.last_updated = new Date();
    await mapping.save();
    console.log(`  Mapping updated.`);
  }

  // Also check all mappings for any threads that have multiple emails with todos
  const allMappings = await TopicThreadMap.findAll();
  for (const mapping of allMappings) {
    // Get all emails in this thread
    const threadEmails = await EmailThread.findAll({
      where: { gmail_thread_id: mapping.gmail_thread_id, processed: true },
      order: [['received_at', 'ASC']],
    });

    // Collect all todos from all emails in this thread
    const allTodos: string[] = [];
    let topicName = '';
    for (const email of threadEmails) {
      if (email.classified_data?.topic && !topicName) {
        topicName = email.classified_data.topic;
      }
      if (email.classified_data?.todos) {
        allTodos.push(...email.classified_data.todos);
      }
    }

    if (allTodos.length === 0 || mapping.basecamp_todolist_id) continue;

    console.log(`\n[create from thread] Todolist: "${topicName}"`);
    const todolist = await basecamp.createTodoList(topicName);

    for (const todo of allTodos) {
      const result = await basecamp.addTodo(todolist.id, todo);
      console.log(`  + Todo: "${todo}" (ID: ${result.id})`);
    }

    mapping.basecamp_todolist_id = todolist.id;
    mapping.last_updated = new Date();
    await mapping.save();
    console.log(`  Mapping updated.`);
  }

  console.log('\n=== Done ===\n');
  await sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
