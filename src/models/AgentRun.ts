import { DataTypes, Model, Sequelize } from 'sequelize';

export interface AgentRunAttributes {
  id: string;
  agent_name: string;
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number | null;
  details: object | null;
  error_message: string | null;
  created_at?: Date;
}

export class AgentRun extends Model<AgentRunAttributes> implements AgentRunAttributes {
  declare id: string;
  declare agent_name: string;
  declare status: 'success' | 'failed' | 'skipped';
  declare duration_ms: number | null;
  declare details: object | null;
  declare error_message: string | null;
  declare created_at: Date;
}

export function initAgentRunModel(sequelize: Sequelize): typeof AgentRun {
  AgentRun.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    agent_name: { type: DataTypes.STRING(100), allowNull: false },
    status: { type: DataTypes.ENUM('success', 'failed', 'skipped'), allowNull: false, defaultValue: 'success' },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'agent_runs', timestamps: false,
    indexes: [
      { fields: ['agent_name', 'created_at'] },
      { fields: ['status'] },
    ],
  });
  return AgentRun;
}
