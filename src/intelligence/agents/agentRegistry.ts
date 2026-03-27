import { AiAgent, AiAgentCreationAttributes } from '../../models/AiAgent';

export interface AgentDefinition {
  name: string;
  type: string;
  department?: string;
  schedule?: string;
  config?: object;
  enabled?: boolean;
}

/**
 * Register an agent using findOrCreate pattern (idempotent seeding).
 */
export async function registerAgent(definition: AgentDefinition): Promise<AiAgent> {
  const [agent, created] = await AiAgent.findOrCreate({
    where: { name: definition.name },
    defaults: {
      name: definition.name,
      type: definition.type,
      department: definition.department || null,
      schedule: definition.schedule || null,
      config: definition.config || null,
      enabled: definition.enabled !== false,
      status: 'active',
    },
  });

  if (!created) {
    // Update config if agent already exists
    await agent.update({
      type: definition.type,
      department: definition.department || agent.department,
      schedule: definition.schedule || agent.schedule,
      config: definition.config || agent.config,
    });
  }

  return agent;
}

export async function getAgent(name: string): Promise<AiAgent | null> {
  return AiAgent.findOne({ where: { name } });
}

export async function enableAgent(name: string): Promise<AiAgent> {
  const agent = await AiAgent.findOne({ where: { name } });
  if (!agent) throw new Error(`Agent not found: ${name}`);
  await agent.update({ enabled: true, status: 'active' });
  return agent;
}

export async function disableAgent(name: string): Promise<AiAgent> {
  const agent = await AiAgent.findOne({ where: { name } });
  if (!agent) throw new Error(`Agent not found: ${name}`);
  await agent.update({ enabled: false, status: 'disabled' });
  return agent;
}

export async function listAgents(filters: { type?: string; department?: string; enabled?: boolean } = {}) {
  const where: Record<string, unknown> = {};
  if (filters.type) where.type = filters.type;
  if (filters.department) where.department = filters.department;
  if (filters.enabled !== undefined) where.enabled = filters.enabled;
  return AiAgent.findAll({ where, order: [['name', 'ASC']] });
}

export async function recordAgentRun(name: string, metrics?: object): Promise<void> {
  const agent = await AiAgent.findOne({ where: { name } });
  if (agent) {
    await agent.update({ last_run_at: new Date(), metrics: metrics || agent.metrics });
  }
}
