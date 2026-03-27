import { DataTypes, Model, Sequelize } from 'sequelize';

export interface AuditLogAttributes {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: object | null;
  new_value: object | null;
  ip_address: string | null;
  metadata: object | null;
  created_at?: Date;
}

export interface AuditLogCreationAttributes extends Omit<AuditLogAttributes, 'id' | 'created_at'> {
  id?: string;
}

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: string;
  declare user_id: string | null;
  declare action: string;
  declare entity_type: string;
  declare entity_id: string | null;
  declare old_value: object | null;
  declare new_value: object | null;
  declare ip_address: string | null;
  declare metadata: object | null;
  declare created_at: Date;
}

export function initAuditLogModel(sequelize: Sequelize): typeof AuditLog {
  AuditLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      old_value: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      new_value: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'audit_logs',
      timestamps: false,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['action'] },
        { fields: ['created_at'] },
      ],
    },
  );

  return AuditLog;
}
