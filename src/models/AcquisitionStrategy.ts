import { DataTypes, Model, Sequelize } from 'sequelize';

export const STRATEGY_STATUSES = ['draft', 'active', 'paused', 'completed'] as const;
export const CHANNEL_TYPES = ['email_outreach', 'linkedin', 'referral', 'content_marketing', 'paid_ads', 'events', 'partnerships', 'other'] as const;

export interface AcquisitionStrategyAttributes {
  id: string;
  name: string;
  description: string | null;
  channel: (typeof CHANNEL_TYPES)[number];
  status: (typeof STRATEGY_STATUSES)[number];
  target_audience: string | null;
  goals: string | null;
  budget: number | null;
  budget_spent: number | null;
  leads_generated: number;
  conversions: number;
  conversion_rate: number | null;
  owner_id: string | null;
  start_date: Date | null;
  end_date: Date | null;
  metrics: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface AcquisitionStrategyCreation
  extends Omit<AcquisitionStrategyAttributes, 'id' | 'created_at' | 'updated_at' | 'leads_generated' | 'conversions' | 'conversion_rate' | 'budget_spent'> {
  id?: string;
  leads_generated?: number;
  conversions?: number;
  conversion_rate?: number | null;
  budget_spent?: number | null;
}

export class AcquisitionStrategy extends Model<AcquisitionStrategyAttributes, AcquisitionStrategyCreation> implements AcquisitionStrategyAttributes {
  declare id: string; declare name: string; declare description: string | null;
  declare channel: (typeof CHANNEL_TYPES)[number]; declare status: (typeof STRATEGY_STATUSES)[number];
  declare target_audience: string | null; declare goals: string | null;
  declare budget: number | null; declare budget_spent: number | null;
  declare leads_generated: number; declare conversions: number;
  declare conversion_rate: number | null; declare owner_id: string | null;
  declare start_date: Date | null; declare end_date: Date | null;
  declare metrics: object | null; declare created_at: Date; declare updated_at: Date;
}

export function initAcquisitionStrategyModel(sequelize: Sequelize): typeof AcquisitionStrategy {
  AcquisitionStrategy.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    channel: { type: DataTypes.ENUM(...CHANNEL_TYPES), allowNull: false },
    status: { type: DataTypes.ENUM(...STRATEGY_STATUSES), allowNull: false, defaultValue: 'draft' },
    target_audience: { type: DataTypes.TEXT, allowNull: true },
    goals: { type: DataTypes.TEXT, allowNull: true },
    budget: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    budget_spent: { type: DataTypes.DECIMAL(12, 2), allowNull: true, defaultValue: 0 },
    leads_generated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    conversions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    conversion_rate: { type: DataTypes.FLOAT, allowNull: true },
    owner_id: { type: DataTypes.UUID, allowNull: true },
    start_date: { type: DataTypes.DATE, allowNull: true },
    end_date: { type: DataTypes.DATE, allowNull: true },
    metrics: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'acquisition_strategies', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['channel'] }],
  });
  return AcquisitionStrategy;
}
