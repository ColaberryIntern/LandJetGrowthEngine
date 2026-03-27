import { DataTypes, Model, Sequelize } from 'sequelize';

export const ERROR_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

export interface CampaignErrorAttributes {
  id: string;
  campaign_id: string;
  component: string;
  severity: (typeof ERROR_SEVERITIES)[number];
  error_message: string;
  context: object | null;
  resolved: boolean;
  resolved_at: Date | null;
  resolved_by: string | null;
  stack_trace: string | null;
  ai_reasoning: string | null;
  repair_attempt_id: string | null;
  retry_count: number;
  last_retry_at: Date | null;
  created_at?: Date;
}

export class CampaignError extends Model<CampaignErrorAttributes> implements CampaignErrorAttributes {
  declare id: string; declare campaign_id: string; declare component: string;
  declare severity: (typeof ERROR_SEVERITIES)[number]; declare error_message: string;
  declare context: object | null; declare resolved: boolean; declare resolved_at: Date | null;
  declare resolved_by: string | null; declare stack_trace: string | null;
  declare ai_reasoning: string | null; declare repair_attempt_id: string | null;
  declare retry_count: number; declare last_retry_at: Date | null; declare created_at: Date;
}

export function initCampaignErrorModel(sequelize: Sequelize): typeof CampaignError {
  CampaignError.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    campaign_id: { type: DataTypes.UUID, allowNull: false },
    component: { type: DataTypes.STRING(50), allowNull: false },
    severity: { type: DataTypes.ENUM(...ERROR_SEVERITIES), allowNull: false },
    error_message: { type: DataTypes.TEXT, allowNull: false },
    context: { type: DataTypes.JSONB, allowNull: true },
    resolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    resolved_by: { type: DataTypes.UUID, allowNull: true },
    stack_trace: { type: DataTypes.TEXT, allowNull: true },
    ai_reasoning: { type: DataTypes.TEXT, allowNull: true },
    repair_attempt_id: { type: DataTypes.UUID, allowNull: true },
    retry_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_retry_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'campaign_errors', timestamps: false, indexes: [{ fields: ['campaign_id'] }, { fields: ['severity'] }, { fields: ['resolved'] }] });
  return CampaignError;
}
