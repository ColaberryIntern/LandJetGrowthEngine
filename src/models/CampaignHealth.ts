import { DataTypes, Model, Sequelize } from 'sequelize';

export const HEALTH_STATUSES = ['healthy', 'degraded', 'critical', 'unknown'] as const;

export interface CampaignHealthAttributes {
  id: string;
  campaign_id: string;
  health_score: number;
  status: (typeof HEALTH_STATUSES)[number];
  lead_count: number;
  active_lead_count: number;
  sent_count: number;
  error_count: number;
  components: object | null;
  metrics: object | null;
  last_scan_at: Date | null;
}

export class CampaignHealth extends Model<CampaignHealthAttributes> implements CampaignHealthAttributes {
  declare id: string; declare campaign_id: string; declare health_score: number;
  declare status: (typeof HEALTH_STATUSES)[number]; declare lead_count: number;
  declare active_lead_count: number; declare sent_count: number; declare error_count: number;
  declare components: object | null; declare metrics: object | null; declare last_scan_at: Date | null;
}

export function initCampaignHealthModel(sequelize: Sequelize): typeof CampaignHealth {
  CampaignHealth.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    campaign_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    health_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    status: { type: DataTypes.ENUM(...HEALTH_STATUSES), allowNull: false, defaultValue: 'unknown' },
    lead_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active_lead_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sent_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    components: { type: DataTypes.JSONB, allowNull: true },
    metrics: { type: DataTypes.JSONB, allowNull: true },
    last_scan_at: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize, tableName: 'campaign_health', timestamps: false });
  return CampaignHealth;
}
