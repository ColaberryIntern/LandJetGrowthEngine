import { logger } from '../config/logger';

function getBasecampConfig() {
  const token = process.env.BASECAMP_ACCESS_TOKEN;
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  const projectId = process.env.BASECAMP_PROJECT_ID;

  if (!token || !accountId || !projectId) {
    throw new Error('BASECAMP_ACCESS_TOKEN, BASECAMP_ACCOUNT_ID, and BASECAMP_PROJECT_ID must be configured');
  }

  return { token, accountId, projectId };
}

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'LandJet Growth Engine (support@colaberry.com)',
  };
}

function baseUrl(accountId: string): string {
  return `https://3.basecampapi.com/${accountId}`;
}

async function basecampFetch(path: string, options: RequestInit = {}): Promise<any> {
  const config = getBasecampConfig();
  const url = `${baseUrl(config.accountId)}${path}`;
  const headers = getHeaders(config.token);

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Basecamp API error', { status: response.status, path, error: errorBody });
    throw new Error(`Basecamp API error ${response.status}: ${errorBody}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Get project details including dock items (message_board, todoset, etc.)
 */
export async function getProject(): Promise<any> {
  const config = getBasecampConfig();
  return basecampFetch(`/projects/${config.projectId}.json`);
}

/**
 * Get the message board ID and todoset ID from the project dock.
 */
export async function getDockIds(): Promise<{ messageBoardId: string; todosetId: string }> {
  const project = await getProject();
  const dock = project.dock || [];

  const messageBoard = dock.find((d: any) => d.name === 'message_board');
  const todoset = dock.find((d: any) => d.name === 'todoset');

  if (!messageBoard) throw new Error('Message board not found in project dock');
  if (!todoset) throw new Error('Todoset not found in project dock');

  return {
    messageBoardId: String(messageBoard.id),
    todosetId: String(todoset.id),
  };
}

/**
 * Create a topic (message) on the project's message board.
 */
export async function createTopic(title: string, content: string): Promise<{ id: string }> {
  const config = getBasecampConfig();
  const { messageBoardId } = await getDockIds();

  const result = await basecampFetch(
    `/buckets/${config.projectId}/message_boards/${messageBoardId}/messages.json`,
    {
      method: 'POST',
      body: JSON.stringify({ subject: title, content, status: 'active' }),
    },
  );

  logger.info('Created Basecamp topic', { id: result.id, title });
  return { id: String(result.id) };
}

/**
 * Append a comment to an existing topic (recording).
 */
export async function appendComment(topicId: string, content: string): Promise<{ id: string }> {
  const config = getBasecampConfig();

  const result = await basecampFetch(
    `/buckets/${config.projectId}/recordings/${topicId}/comments.json`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    },
  );

  logger.info('Appended comment to Basecamp topic', { topicId, commentId: result.id });
  return { id: String(result.id) };
}

/**
 * Create a todolist under the project's todoset.
 */
export async function createTodoList(title: string, description?: string): Promise<{ id: string }> {
  const config = getBasecampConfig();
  const { todosetId } = await getDockIds();

  const result = await basecampFetch(
    `/buckets/${config.projectId}/todosets/${todosetId}/todolists.json`,
    {
      method: 'POST',
      body: JSON.stringify({ name: title, description: description || '' }),
    },
  );

  logger.info('Created Basecamp todolist', { id: result.id, title });
  return { id: String(result.id) };
}

/**
 * Add a single todo to a todolist.
 */
export async function addTodo(
  todolistId: string,
  content: string,
  assigneeIds?: number[],
): Promise<{ id: string }> {
  const config = getBasecampConfig();

  const body: any = { content };
  if (assigneeIds?.length) {
    body.assignee_ids = assigneeIds;
  }

  const result = await basecampFetch(
    `/buckets/${config.projectId}/todolists/${todolistId}/todos.json`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  logger.info('Added Basecamp todo', { todolistId, todoId: result.id, content });
  return { id: String(result.id) };
}

/**
 * Add multiple todos to a todolist.
 */
export async function addTodos(
  todolistId: string,
  todos: { content: string; assigneeIds?: number[] }[],
): Promise<{ id: string }[]> {
  const results: { id: string }[] = [];
  for (const todo of todos) {
    const result = await addTodo(todolistId, todo.content, todo.assigneeIds);
    results.push(result);
  }
  return results;
}

/**
 * Get people on the project.
 */
export async function getPeople(): Promise<{ id: number; name: string; email_address: string }[]> {
  const config = getBasecampConfig();
  return basecampFetch(`/projects/${config.projectId}/people.json`);
}
