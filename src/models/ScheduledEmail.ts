import { DataTypes, Model, Sequelize } from 'sequelize';

export const SCHEDULED_EMAIL_STATUSES = [
  'pending', 'processing', 'sent', 'failed', 'cancelled', 'paused', 'draft', 'approved',
] as const;
export type ScheduledEmailStatus = (typeof SCHEDULED_EMAIL_STATUSES)[number];

export const CHANNELS = ['email', 'voice', 'sms'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ScheduledEmailMetadata {
  ai_tone?: string;
  ai_context_notes?: string;
  variant_id?: string;
  variant_label?: string;
  ai_tokens_used?: number;
  ai_model?: string;
  step_goal?: string;
  step_number?: number;
  // CEO Intro Engine (draft mode) fields
  draft_mode?: boolean;
  draft_version?: number;
  polisher_changes?: string[];
  polisher_quality_score?: number;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  ceo_signature_appended?: boolean;
  last_email_sent?: string;
}

export interface ScheduledEmailAttributes {
  id: string;
  lead_id: number;
  campaign_id: string | null;
  sequence_id: string | null;
  step_index: number;
  channel: Channel;
  subject: string | null;
  body: string | null;
  to_email: string | null;
  to_phone: string | null;
  voice_agent_type: string | null;
  max_attempts: number;
  attempts_made: number;
  fallback_channel: string | null;
  scheduled_for: Date;
  sent_at: Date | null;
  status: ScheduledEmailStatus;
  processing_started_at: Date | null;
  processor_id: string | null;
  ai_instructions: string | null;
  ai_generated: boolean;
  is_test_action: boolean;
  metadata: ScheduledEmailMetadata | null;
  created_at?: Date;
}

export interface ScheduledEmailCreationAttributes
  extends Omit<ScheduledEmailAttributes, 'id' | 'created_at' | 'attempts_made' | 'sent_at' | 'processing_started_at' | 'processor_id' | 'ai_generated'> {
  id?: string;
  attempts_made?: number;
  sent_at?: Date | null;
  processing_started_at?: Date | null;
  processor_id?: string | null;
  ai_generated?: boolean;
}

export class ScheduledEmail
  extends Model<ScheduledEmailAttributes, ScheduledEmailCreationAttributes>
  implements ScheduledEmailAttributes
{
  declare id: string;
  declare lead_id: number;
  declare campaign_id: string | null;
  declare sequence_id: string | null;
  declare step_index: number;
  declare channel: Channel;
  declare subject: string | null;
  declare body: string | null;
  declare to_email: string | null;
  declare to_phone: string | null;
  declare voice_agent_type: string | null;
  declare max_attempts: number;
  declare attempts_made: number;
  declare fallback_channel: string | null;
  declare scheduled_for: Date;
  declare sent_at: Date | null;
  declare status: ScheduledEmailStatus;
  declare processing_started_at: Date | null;
  declare processor_id: string | null;
  declare ai_instructions: string | null;
  declare ai_generated: boolean;
  declare is_test_action: boolean;
  declare metadata: ScheduledEmailMetadata | null;
  declare created_at: Date;
}

export function initScheduledEmailModel(sequelize: Sequelize): typeof ScheduledEmail {
  ScheduledEmail.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull: false },
      campaign_id: { type: DataTypes.UUID, allowNull: true },
      sequence_id: { type: DataTypes.UUID, allowNull: true },
      step_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      channel: { type: DataTypes.ENUM(...CHANNELS), allowNull: false },
      subject: { type: DataTypes.STRING(255), allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: true },
      to_email: { type: DataTypes.STRING(255), allowNull: true },
      to_phone: { type: DataTypes.STRING(30), allowNull: true },
      voice_agent_type: { type: DataTypes.STRING(50), allowNull: true },
      max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      attempts_made: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      fallback_channel: { type: DataTypes.STRING(10), allowNull: true },
      scheduled_for: { type: DataTypes.DATE, allowNull: false },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      status: { type: DataTypes.ENUM(...SCHEDULED_EMAIL_STATUSES), allowNull: false, defaultValue: 'pending' },
      processing_started_at: { type: DataTypes.DATE, allowNull: true },
      processor_id: { type: DataTypes.STRING(100), allowNull: true },
      ai_instructions: { type: DataTypes.TEXT, allowNull: true },
      ai_generated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_test_action: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'scheduled_emails',
      timestamps: false,
      indexes: [
        { fields: ['status', 'scheduled_for'] },
        { fields: ['status', 'processing_started_at'] },
        { fields: ['campaign_id', 'status'] },
        { fields: ['lead_id'] },
      ],
    },
  );
  return ScheduledEmail;
}
