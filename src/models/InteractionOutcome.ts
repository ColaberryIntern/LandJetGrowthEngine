import { DataTypes, Model, Sequelize } from 'sequelize';

export const OUTCOME_TYPES = [
  'sent', 'opened', 'clicked', 'replied', 'booked_meeting',
  'converted', 'no_response', 'bounced', 'unsubscribed',
  'voicemail', 'answered', 'declined',
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export interface InteractionOutcomeAttributes {
  id: string;
  lead_id: number;
  campaign_id: string | null;
  scheduled_email_id: string | null;
  channel: string;
  step_index: number;
  outcome: OutcomeType;
  lead_industry: string | null;
  lead_title_category: string | null;
  lead_company_size_bucket: string | null;
  lead_source_type: string | null;
  metadata: object | null;
  created_at?: Date;
}

export interface InteractionOutcomeCreationAttributes
  extends Omit<InteractionOutcomeAttributes, 'id' | 'created_at'> {
  id?: string;
}

export class InteractionOutcome
  extends Model<InteractionOutcomeAttributes, InteractionOutcomeCreationAttributes>
  implements InteractionOutcomeAttributes
{
  declare id: string;
  declare lead_id: number;
  declare campaign_id: string | null;
  declare scheduled_email_id: string | null;
  declare channel: string;
  declare step_index: number;
  declare outcome: OutcomeType;
  declare lead_industry: string | null;
  declare lead_title_category: string | null;
  declare lead_company_size_bucket: string | null;
  declare lead_source_type: string | null;
  declare metadata: object | null;
  declare created_at: Date;
}

export function initInteractionOutcomeModel(sequelize: Sequelize): typeof InteractionOutcome {
  InteractionOutcome.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull: false },
      campaign_id: { type: DataTypes.UUID, allowNull: true },
      scheduled_email_id: { type: DataTypes.UUID, allowNull: true },
      channel: { type: DataTypes.STRING(10), allowNull: false },
      step_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      outcome: { type: DataTypes.ENUM(...OUTCOME_TYPES), allowNull: false },
      lead_industry: { type: DataTypes.STRING(100), allowNull: true },
      lead_title_category: { type: DataTypes.STRING(100), allowNull: true },
      lead_company_size_bucket: { type: DataTypes.STRING(50), allowNull: true },
      lead_source_type: { type: DataTypes.STRING(50), allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'interaction_outcomes',
      timestamps: false,
      indexes: [
        { fields: ['lead_id'] },
        { fields: ['campaign_id'] },
        { fields: ['outcome'] },
        { fields: ['channel'] },
        { fields: ['created_at'] },
        { fields: ['campaign_id', 'outcome'] },
      ],
    },
  );
  return InteractionOutcome;
}
