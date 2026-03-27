import { DataTypes, Model, Sequelize } from 'sequelize';

export interface DncListAttributes {
  id: string;
  email: string | null;
  phone: string | null;
  reason: string | null;
  created_at?: Date;
}

export class DncList extends Model<DncListAttributes> implements DncListAttributes {
  declare id: string;
  declare email: string | null;
  declare phone: string | null;
  declare reason: string | null;
  declare created_at: Date;
}

export function initDncListModel(sequelize: Sequelize): typeof DncList {
  DncList.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'dnc_list', timestamps: false, indexes: [{ fields: ['email'] }, { fields: ['phone'] }] },
  );
  return DncList;
}
