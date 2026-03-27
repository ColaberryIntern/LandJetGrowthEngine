import { DataTypes, Model, Sequelize } from 'sequelize';

export const INSIGHT_TYPES = ['channel_perf', 'timing', 'audience', 'message_pattern', 'conversion'] as const;

export interface CampaignInsightAttributes {
  id: number;
  campaign_id: string | null;
  insight_type: (typeof INSIGHT_TYPES)[number];
  category: string;
  insight: string;
  evidence: object | null;
  confidence: number;
  applicable_to: object | null;
  times_applied: number;
  last_applied_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CampaignInsightCreation extends Omit<CampaignInsightAttributes, 'id' | 'created_at' | 'updated_at'> {}

export class CampaignInsight extends Model<CampaignInsightAttributes, CampaignInsightCreation> implements CampaignInsightAttributes {
  declare id: number; declare campaign_id: string | null; declare insight_type: (typeof INSIGHT_TYPES)[number];
  declare category: string; declare insight: string; declare evidence: object | null;
  declare confidence: number; declare applicable_to: object | null; declare times_applied: number;
  declare last_applied_at: Date | null; declare created_at: Date; declare updated_at: Date;
}

export function initCampaignInsightModel(sequelize: Sequelize): typeof CampaignInsight {
  CampaignInsight.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    campaign_id: { type: DataTypes.UUID, allowNull: true },
    insight_type: { type: DataTypes.ENUM(...INSIGHT_TYPES), allowNull: false },
    category: { type: DataTypes.STRING(100), allowNull: false },
    insight: { type: DataTypes.TEXT, allowNull: false },
    evidence: { type: DataTypes.JSONB, allowNull: true },
    confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    applicable_to: { type: DataTypes.JSONB, allowNull: true },
    times_applied: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_applied_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'campaign_insights', timestamps: true, underscored: true, indexes: [{ fields: ['campaign_id'] }, { fields: ['insight_type'] }, { fields: ['confidence'] }] });
  return CampaignInsight;
}
