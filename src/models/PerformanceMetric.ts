import { DataTypes, Model, Sequelize } from 'sequelize';

export const METRIC_CATEGORIES = ['api_latency', 'db_query', 'ai_generation', 'email_delivery', 'scheduler_cycle', 'memory_usage', 'throughput'] as const;

export interface PerformanceMetricAttributes {
  id: string;
  category: (typeof METRIC_CATEGORIES)[number];
  metric_name: string;
  value: number;
  unit: string;
  threshold_warning: number | null;
  threshold_critical: number | null;
  status: 'normal' | 'warning' | 'critical';
  context: object | null;
  recorded_at: Date;
}

export interface PerformanceMetricCreation extends Omit<PerformanceMetricAttributes, 'id' | 'status'> {
  id?: string;
  status?: 'normal' | 'warning' | 'critical';
}

export class PerformanceMetric extends Model<PerformanceMetricAttributes, PerformanceMetricCreation> implements PerformanceMetricAttributes {
  declare id: string; declare category: (typeof METRIC_CATEGORIES)[number];
  declare metric_name: string; declare value: number; declare unit: string;
  declare threshold_warning: number | null; declare threshold_critical: number | null;
  declare status: 'normal' | 'warning' | 'critical';
  declare context: object | null; declare recorded_at: Date;
}

export function initPerformanceMetricModel(sequelize: Sequelize): typeof PerformanceMetric {
  PerformanceMetric.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    category: { type: DataTypes.ENUM(...METRIC_CATEGORIES), allowNull: false },
    metric_name: { type: DataTypes.STRING(255), allowNull: false },
    value: { type: DataTypes.FLOAT, allowNull: false },
    unit: { type: DataTypes.STRING(50), allowNull: false },
    threshold_warning: { type: DataTypes.FLOAT, allowNull: true },
    threshold_critical: { type: DataTypes.FLOAT, allowNull: true },
    status: { type: DataTypes.ENUM('normal', 'warning', 'critical'), allowNull: false, defaultValue: 'normal' },
    context: { type: DataTypes.JSONB, allowNull: true },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'performance_metrics', timestamps: false,
    indexes: [{ fields: ['category'] }, { fields: ['status'] }, { fields: ['recorded_at'] }, { fields: ['metric_name'] }],
  });
  return PerformanceMetric;
}
