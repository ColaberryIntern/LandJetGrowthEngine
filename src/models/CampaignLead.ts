import { DataTypes, Model, Sequelize } from 'sequelize';

export const CAMPAIGN_LEAD_STATUSES = ['enrolled', 'active', 'paused', 'completed', 'removed'] as const;
export const LIFECYCLE_STATUSES = ['active', 'inactive', 're_engaging', 'enrolled', 'dnd', 'bounced'] as const;

export interface CampaignLeadAttributes {
  id: string;
  campaign_id: string;
  lead_id: number;
  status: (typeof CAMPAIGN_LEAD_STATUSES)[number];
  lifecycle_status: (typeof LIFECYCLE_STATUSES)[number];
  enrolled_at: Date;
  completed_at: Date | null;
  outcome: string | null;
  current_step_index: number;
  total_steps: number;
  last_activity_at: Date | null;
  next_action_at: Date | null;
  touchpoint_count: number;
  response_count: number;
  campaign_cycle_number: number;
  last_campaign_entry: Date | null;
  metadata: object | null;
}

export interface CampaignLeadCreationAttributes
  extends Omit<CampaignLeadAttributes, 'id' | 'touchpoint_count' | 'response_count' | 'campaign_cycle_number' | 'completed_at' | 'outcome' | 'last_activity_at' | 'next_action_at' | 'last_campaign_entry'> {
  id?: string;
  touchpoint_count?: number;
  response_count?: number;
  campaign_cycle_number?: number;
  completed_at?: Date | null;
  outcome?: string | null;
  last_activity_at?: Date | null;
  next_action_at?: Date | null;
  last_campaign_entry?: Date | null;
}

export class CampaignLead
  extends Model<CampaignLeadAttributes, CampaignLeadCreationAttributes>
  implements CampaignLeadAttributes
{
  declare id: string;
  declare campaign_id: string;
  declare lead_id: number;
  declare status: (typeof CAMPAIGN_LEAD_STATUSES)[number];
  declare lifecycle_status: (typeof LIFECYCLE_STATUSES)[number];
  declare enrolled_at: Date;
  declare completed_at: Date | null;
  declare outcome: string | null;
  declare current_step_index: number;
  declare total_steps: number;
  declare last_activity_at: Date | null;
  declare next_action_at: Date | null;
  declare touchpoint_count: number;
  declare response_count: number;
  declare campaign_cycle_number: number;
  declare last_campaign_entry: Date | null;
  declare metadata: object | null;
}

export function initCampaignLeadModel(sequelize: Sequelize): typeof CampaignLead {
  CampaignLead.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      campaign_id: { type: DataTypes.UUID, allowNull: false },
      lead_id: { type: DataTypes.INTEGER, allowNull: false },
      status: { type: DataTypes.ENUM(...CAMPAIGN_LEAD_STATUSES), allowNull: false, defaultValue: 'enrolled' },
      lifecycle_status: { type: DataTypes.ENUM(...LIFECYCLE_STATUSES), allowNull: false, defaultValue: 'active' },
      enrolled_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      outcome: { type: DataTypes.STRING(100), allowNull: true },
      current_step_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      total_steps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_activity_at: { type: DataTypes.DATE, allowNull: true },
      next_action_at: { type: DataTypes.DATE, allowNull: true },
      touchpoint_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      response_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      campaign_cycle_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      last_campaign_entry: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      tableName: 'campaign_leads',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['campaign_id', 'lead_id'] },
        { fields: ['campaign_id', 'status'] },
        { fields: ['lead_id'] },
        { fields: ['next_action_at'] },
      ],
    },
  );
  return CampaignLead;
}
