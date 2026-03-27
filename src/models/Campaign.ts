import { DataTypes, Model, Sequelize } from 'sequelize';

export const CAMPAIGN_TYPES = [
  'warm_nurture', 'cold_outbound', 're_engagement',
  'behavioral_trigger', 'alumni', 'alumni_re_engagement',
  'payment_readiness', 'executive_outreach',
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_MODES = ['standard', 'autonomous'] as const;

export const APPROVAL_STATUSES = [
  'draft', 'pending_approval', 'approved', 'live', 'paused', 'completed',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const QA_STATUSES = ['untested', 'passed', 'failed'] as const;

export interface TargetingCriteria {
  industries?: string[];
  title_patterns?: string[];
  company_size_min?: number;
  company_size_max?: number;
  score_min?: number;
  lead_source_type?: string;
}

export interface ChannelConfig {
  email?: { enabled: boolean; daily_limit?: number };
  voice?: { enabled: boolean; max_daily_calls?: number };
  sms?: { enabled: boolean };
}

export interface CampaignSettings {
  test_mode_enabled?: boolean;
  test_email?: string;
  test_phone?: string;
  delay_between_sends?: number;
  max_leads_per_cycle?: number;
  call_time_start?: string;
  call_time_end?: string;
  call_timezone?: string;
  call_active_days?: number[];
  max_daily_calls?: number;
  voicemail_enabled?: boolean;
  auto_dnc_on_request?: boolean;
  sender_email?: string;
  sender_name?: string;
}

export interface CampaignAttributes {
  id: string;
  name: string;
  description: string | null;
  type: CampaignType;
  status: CampaignStatus;
  campaign_mode: 'standard' | 'autonomous';
  sequence_id: string | null;
  targeting_criteria: TargetingCriteria | null;
  channel_config: ChannelConfig | null;
  ai_system_prompt: string | null;
  settings: CampaignSettings | null;
  budget_total: number | null;
  budget_spent: number | null;
  budget_cap: number | null;
  cost_per_lead_target: number | null;
  expected_roi: number | null;
  goals: string | null;
  gtm_notes: string | null;
  interest_group: string | null;
  qa_status: 'untested' | 'passed' | 'failed';
  ramp_state: object | null;
  evolution_config: object | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: Date | null;
  created_by: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CampaignCreationAttributes
  extends Omit<CampaignAttributes, 'id' | 'created_at' | 'updated_at' | 'budget_spent' | 'qa_status' | 'approval_status' | 'approved_by' | 'approved_at' | 'ramp_state' | 'evolution_config'> {
  id?: string;
  budget_spent?: number | null;
  qa_status?: 'untested' | 'passed' | 'failed';
  approval_status?: ApprovalStatus;
  approved_by?: string | null;
  approved_at?: Date | null;
  ramp_state?: object | null;
  evolution_config?: object | null;
}

export class Campaign
  extends Model<CampaignAttributes, CampaignCreationAttributes>
  implements CampaignAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare type: CampaignType;
  declare status: CampaignStatus;
  declare campaign_mode: 'standard' | 'autonomous';
  declare sequence_id: string | null;
  declare targeting_criteria: TargetingCriteria | null;
  declare channel_config: ChannelConfig | null;
  declare ai_system_prompt: string | null;
  declare settings: CampaignSettings | null;
  declare budget_total: number | null;
  declare budget_spent: number | null;
  declare budget_cap: number | null;
  declare cost_per_lead_target: number | null;
  declare expected_roi: number | null;
  declare goals: string | null;
  declare gtm_notes: string | null;
  declare interest_group: string | null;
  declare qa_status: 'untested' | 'passed' | 'failed';
  declare ramp_state: object | null;
  declare evolution_config: object | null;
  declare approval_status: ApprovalStatus;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare created_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initCampaignModel(sequelize: Sequelize): typeof Campaign {
  Campaign.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      type: { type: DataTypes.ENUM(...CAMPAIGN_TYPES), allowNull: false },
      status: { type: DataTypes.ENUM(...CAMPAIGN_STATUSES), allowNull: false, defaultValue: 'draft' },
      campaign_mode: { type: DataTypes.ENUM(...CAMPAIGN_MODES), allowNull: false, defaultValue: 'standard' },
      sequence_id: { type: DataTypes.UUID, allowNull: true },
      targeting_criteria: { type: DataTypes.JSONB, allowNull: true },
      channel_config: { type: DataTypes.JSONB, allowNull: true },
      ai_system_prompt: { type: DataTypes.TEXT, allowNull: true },
      settings: { type: DataTypes.JSONB, allowNull: true },
      budget_total: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      budget_spent: { type: DataTypes.DECIMAL(12, 2), allowNull: true, defaultValue: 0 },
      budget_cap: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      cost_per_lead_target: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      expected_roi: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      goals: { type: DataTypes.TEXT, allowNull: true },
      gtm_notes: { type: DataTypes.TEXT, allowNull: true },
      interest_group: { type: DataTypes.STRING(255), allowNull: true },
      qa_status: { type: DataTypes.ENUM(...QA_STATUSES), allowNull: false, defaultValue: 'untested' },
      ramp_state: { type: DataTypes.JSONB, allowNull: true },
      evolution_config: { type: DataTypes.JSONB, allowNull: true },
      approval_status: { type: DataTypes.ENUM(...APPROVAL_STATUSES), allowNull: false, defaultValue: 'draft' },
      approved_by: { type: DataTypes.UUID, allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'campaigns',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['type'] },
        { fields: ['approval_status'] },
        { fields: ['sequence_id'] },
      ],
    },
  );
  return Campaign;
}
