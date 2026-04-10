import { DataTypes, Model, Sequelize } from 'sequelize';

export const ETL_STATUSES = ['pending', 'extracting', 'transforming', 'loading', 'completed', 'failed'] as const;
export const ETL_SOURCES = ['user_interactions', 'api_metrics', 'survey_responses', 'campaign_data', 'visitor_data', 'custom'] as const;

export interface EtlPipelineAttributes {
  id: string;
  name: string;
  source: (typeof ETL_SOURCES)[number];
  status: (typeof ETL_STATUSES)[number];
  records_extracted: number;
  records_transformed: number;
  records_loaded: number;
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
  config: object | null;
  created_at?: Date;
}

export interface EtlPipelineCreation extends Omit<EtlPipelineAttributes, 'id' | 'created_at' | 'records_extracted' | 'records_transformed' | 'records_loaded' | 'completed_at' | 'duration_ms' | 'error_message'> {
  id?: string; records_extracted?: number; records_transformed?: number; records_loaded?: number;
  completed_at?: Date | null; duration_ms?: number | null; error_message?: string | null;
}

export class EtlPipeline extends Model<EtlPipelineAttributes, EtlPipelineCreation> implements EtlPipelineAttributes {
  declare id: string; declare name: string; declare source: (typeof ETL_SOURCES)[number];
  declare status: (typeof ETL_STATUSES)[number]; declare records_extracted: number;
  declare records_transformed: number; declare records_loaded: number;
  declare started_at: Date | null; declare completed_at: Date | null;
  declare duration_ms: number | null; declare error_message: string | null;
  declare config: object | null; declare created_at: Date;
}

export function initEtlPipelineModel(sequelize: Sequelize): typeof EtlPipeline {
  EtlPipeline.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    source: { type: DataTypes.ENUM(...ETL_SOURCES), allowNull: false },
    status: { type: DataTypes.ENUM(...ETL_STATUSES), allowNull: false, defaultValue: 'pending' },
    records_extracted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    records_transformed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    records_loaded: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'etl_pipelines', timestamps: false,
    indexes: [{ fields: ['status'] }, { fields: ['source'] }, { fields: ['created_at'] }],
  });
  return EtlPipeline;
}
