import { DataTypes, Model, Sequelize } from 'sequelize';

export interface AiAgentAttributes {
  id: string;
  name: string;
  type: string;
  department: string | null;
  status: 'active' | 'paused' | 'disabled' | 'error';
  config: object | null;
  schedule: string | null;
  last_run_at: Date | null;
  metrics: object | null;
  enabled: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface AiAgentCreationAttributes extends Omit<AiAgentAttributes, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'metrics'> {
  id?: string;
  last_run_at?: Date | null;
  metrics?: object | null;
}

export class AiAgent extends Model<AiAgentAttributes, AiAgentCreationAttributes> implements AiAgentAttributes {
  declare id: string;
  declare name: string;
  declare type: string;
  declare department: string | null;
  declare status: 'active' | 'paused' | 'disabled' | 'error';
  declare config: object | null;
  declare schedule: string | null;
  declare last_run_at: Date | null;
  declare metrics: object | null;
  declare enabled: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initAiAgentModel(sequelize: Sequelize): typeof AiAgent {
  AiAgent.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      type: { type: DataTypes.STRING(100), allowNull: false },
      department: { type: DataTypes.STRING(100), allowNull: true },
      status: { type: DataTypes.ENUM('active', 'paused', 'disabled', 'error'), allowNull: false, defaultValue: 'active' },
      config: { type: DataTypes.JSONB, allowNull: true },
      schedule: { type: DataTypes.STRING(100), allowNull: true },
      last_run_at: { type: DataTypes.DATE, allowNull: true },
      metrics: { type: DataTypes.JSONB, allowNull: true },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'ai_agents', timestamps: true, underscored: true, indexes: [{ fields: ['type'] }, { fields: ['status'] }, { fields: ['enabled'] }] },
  );
  return AiAgent;
}
