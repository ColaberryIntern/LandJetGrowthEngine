import { DataTypes, Model, Sequelize } from 'sequelize';

export const DEPLOY_STATUSES = ['planned', 'in_progress', 'deployed', 'rolled_back', 'failed'] as const;
export const DEPLOY_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export interface DeploymentAttributes {
  id: string;
  version: string;
  environment: (typeof DEPLOY_ENVIRONMENTS)[number];
  status: (typeof DEPLOY_STATUSES)[number];
  description: string | null;
  changes: string[] | null;
  deployed_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  rollback_reason: string | null;
  metadata: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface DeploymentCreation extends Omit<DeploymentAttributes, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'rollback_reason'> {
  id?: string;
  completed_at?: Date | null;
  rollback_reason?: string | null;
}

export class Deployment extends Model<DeploymentAttributes, DeploymentCreation> implements DeploymentAttributes {
  declare id: string; declare version: string;
  declare environment: (typeof DEPLOY_ENVIRONMENTS)[number];
  declare status: (typeof DEPLOY_STATUSES)[number];
  declare description: string | null; declare changes: string[] | null;
  declare deployed_by: string | null; declare started_at: Date | null;
  declare completed_at: Date | null; declare rollback_reason: string | null;
  declare metadata: object | null; declare created_at: Date; declare updated_at: Date;
}

export function initDeploymentModel(sequelize: Sequelize): typeof Deployment {
  Deployment.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version: { type: DataTypes.STRING(50), allowNull: false },
    environment: { type: DataTypes.ENUM(...DEPLOY_ENVIRONMENTS), allowNull: false },
    status: { type: DataTypes.ENUM(...DEPLOY_STATUSES), allowNull: false, defaultValue: 'planned' },
    description: { type: DataTypes.TEXT, allowNull: true },
    changes: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
    deployed_by: { type: DataTypes.UUID, allowNull: true },
    started_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    rollback_reason: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'deployments', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['environment'] }, { fields: ['version'] }],
  });
  return Deployment;
}
