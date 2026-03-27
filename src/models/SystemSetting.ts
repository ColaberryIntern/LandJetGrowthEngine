import { DataTypes, Model, Sequelize } from 'sequelize';

export interface SystemSettingAttributes {
  key: string;
  value: object;
  description: string | null;
  updated_at?: Date;
}

export interface SystemSettingCreationAttributes
  extends Omit<SystemSettingAttributes, 'updated_at'> {}

export class SystemSetting
  extends Model<SystemSettingAttributes, SystemSettingCreationAttributes>
  implements SystemSettingAttributes
{
  declare key: string;
  declare value: object;
  declare description: string | null;
  declare updated_at: Date;
}

export function initSystemSettingModel(sequelize: Sequelize): typeof SystemSetting {
  SystemSetting.init(
    {
      key: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
      value: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'system_settings',
      timestamps: false,
    },
  );

  return SystemSetting;
}
