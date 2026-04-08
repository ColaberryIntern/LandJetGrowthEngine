import { DataTypes, Model, Sequelize } from 'sequelize';

export const INTEGRATION_STATUSES = ['active', 'degraded', 'offline', 'pending'] as const;
export const INTEGRATION_PROVIDERS = ['openai', 'mandrill', 'synthflow', 'ghl', 'apollo', 'stripe', 'openclaw', 'custom'] as const;

export interface ApiIntegrationAttributes {
  id: string;
  name: string;
  provider: (typeof INTEGRATION_PROVIDERS)[number];
  status: (typeof INTEGRATION_STATUSES)[number];
  base_url: string | null;
  api_version: string | null;
  auth_type: string | null;
  rate_limit: number | null;
  last_health_check: Date | null;
  last_error: string | null;
  total_calls: number;
  error_count: number;
  avg_latency_ms: number | null;
  config: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ApiIntegrationCreation extends Omit<ApiIntegrationAttributes, 'id' | 'created_at' | 'updated_at' | 'total_calls' | 'error_count' | 'avg_latency_ms' | 'last_health_check' | 'last_error'> {
  id?: string;
  total_calls?: number; error_count?: number; avg_latency_ms?: number | null;
  last_health_check?: Date | null; last_error?: string | null;
}

export class ApiIntegration extends Model<ApiIntegrationAttributes, ApiIntegrationCreation> implements ApiIntegrationAttributes {
  declare id: string; declare name: string; declare provider: (typeof INTEGRATION_PROVIDERS)[number];
  declare status: (typeof INTEGRATION_STATUSES)[number]; declare base_url: string | null;
  declare api_version: string | null; declare auth_type: string | null;
  declare rate_limit: number | null; declare last_health_check: Date | null;
  declare last_error: string | null; declare total_calls: number;
  declare error_count: number; declare avg_latency_ms: number | null;
  declare config: object | null; declare created_at: Date; declare updated_at: Date;
}

export function initApiIntegrationModel(sequelize: Sequelize): typeof ApiIntegration {
  ApiIntegration.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    provider: { type: DataTypes.ENUM(...INTEGRATION_PROVIDERS), allowNull: false },
    status: { type: DataTypes.ENUM(...INTEGRATION_STATUSES), allowNull: false, defaultValue: 'pending' },
    base_url: { type: DataTypes.STRING(500), allowNull: true },
    api_version: { type: DataTypes.STRING(20), allowNull: true },
    auth_type: { type: DataTypes.STRING(50), allowNull: true },
    rate_limit: { type: DataTypes.INTEGER, allowNull: true },
    last_health_check: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    total_calls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    avg_latency_ms: { type: DataTypes.FLOAT, allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'api_integrations', timestamps: true, underscored: true,
    indexes: [{ fields: ['provider'] }, { fields: ['status'] }],
  });
  return ApiIntegration;
}
