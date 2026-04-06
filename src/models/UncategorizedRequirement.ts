import { DataTypes, Model, Sequelize } from 'sequelize';

export const REQUIREMENT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];

export const REQUIREMENT_STATUSES = ['unreviewed', 'in_review', 'categorized', 'deferred', 'rejected'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export interface UncategorizedRequirementAttributes {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  priority: RequirementPriority;
  status: RequirementStatus;
  assigned_capability: string | null;
  tags: string[] | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  metadata: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UncategorizedRequirementCreationAttributes
  extends Omit<UncategorizedRequirementAttributes, 'id' | 'created_at' | 'updated_at' | 'reviewed_by' | 'reviewed_at' | 'assigned_capability'> {
  id?: string;
  reviewed_by?: string | null;
  reviewed_at?: Date | null;
  assigned_capability?: string | null;
}

export class UncategorizedRequirement
  extends Model<UncategorizedRequirementAttributes, UncategorizedRequirementCreationAttributes>
  implements UncategorizedRequirementAttributes
{
  declare id: string;
  declare title: string;
  declare description: string | null;
  declare source: string | null;
  declare priority: RequirementPriority;
  declare status: RequirementStatus;
  declare assigned_capability: string | null;
  declare tags: string[] | null;
  declare notes: string | null;
  declare reviewed_by: string | null;
  declare reviewed_at: Date | null;
  declare metadata: object | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initUncategorizedRequirementModel(sequelize: Sequelize): typeof UncategorizedRequirement {
  UncategorizedRequirement.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      title: { type: DataTypes.STRING(500), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      source: { type: DataTypes.STRING(100), allowNull: true },
      priority: { type: DataTypes.ENUM(...REQUIREMENT_PRIORITIES), allowNull: false, defaultValue: 'medium' },
      status: { type: DataTypes.ENUM(...REQUIREMENT_STATUSES), allowNull: false, defaultValue: 'unreviewed' },
      assigned_capability: { type: DataTypes.STRING(255), allowNull: true },
      tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      reviewed_by: { type: DataTypes.UUID, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'uncategorized_requirements',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status'] },
        { fields: ['priority'] },
        { fields: ['assigned_capability'] },
      ],
    },
  );
  return UncategorizedRequirement;
}
