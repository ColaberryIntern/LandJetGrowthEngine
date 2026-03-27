import { DataTypes, Model, Sequelize } from 'sequelize';

export const VARIANT_STATUSES = ['active', 'testing', 'promoted', 'retired'] as const;

export interface CampaignVariantAttributes {
  id: string;
  campaign_id: string;
  step_index: number;
  channel: string;
  variant_label: string;
  subject: string | null;
  body: string | null;
  ai_instructions_override: string | null;
  status: (typeof VARIANT_STATUSES)[number];
  sends: number;
  opens: number;
  replies: number;
  bounces: number;
  conversions: number;
  performance_score: number | null;
  parent_variant_id: string | null;
  generation_metadata: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export class CampaignVariant extends Model<CampaignVariantAttributes> implements CampaignVariantAttributes {
  declare id: string; declare campaign_id: string; declare step_index: number;
  declare channel: string; declare variant_label: string; declare subject: string | null;
  declare body: string | null; declare ai_instructions_override: string | null;
  declare status: (typeof VARIANT_STATUSES)[number]; declare sends: number;
  declare opens: number; declare replies: number; declare bounces: number;
  declare conversions: number; declare performance_score: number | null;
  declare parent_variant_id: string | null; declare generation_metadata: object | null;
  declare created_at: Date; declare updated_at: Date;
}

export function initCampaignVariantModel(sequelize: Sequelize): typeof CampaignVariant {
  CampaignVariant.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    campaign_id: { type: DataTypes.UUID, allowNull: false },
    step_index: { type: DataTypes.INTEGER, allowNull: false },
    channel: { type: DataTypes.STRING(10), allowNull: false },
    variant_label: { type: DataTypes.STRING(10), allowNull: false },
    subject: { type: DataTypes.TEXT, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: true },
    ai_instructions_override: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM(...VARIANT_STATUSES), allowNull: false, defaultValue: 'active' },
    sends: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    opens: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    replies: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bounces: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    conversions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    performance_score: { type: DataTypes.FLOAT, allowNull: true },
    parent_variant_id: { type: DataTypes.UUID, allowNull: true },
    generation_metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'campaign_variants', timestamps: true, underscored: true, indexes: [{ fields: ['campaign_id'] }, { fields: ['status'] }] });
  return CampaignVariant;
}
