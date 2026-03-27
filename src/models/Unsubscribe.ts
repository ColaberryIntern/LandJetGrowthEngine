import { DataTypes, Model, Sequelize } from 'sequelize';

export interface UnsubscribeAttributes {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  created_at?: Date;
}

export interface UnsubscribeCreationAttributes extends Omit<UnsubscribeAttributes, 'id' | 'created_at'> {
  id?: string;
}

export class Unsubscribe extends Model<UnsubscribeAttributes, UnsubscribeCreationAttributes> implements UnsubscribeAttributes {
  declare id: string;
  declare email: string;
  declare reason: string | null;
  declare source: string | null;
  declare created_at: Date;
}

export function initUnsubscribeModel(sequelize: Sequelize): typeof Unsubscribe {
  Unsubscribe.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      source: { type: DataTypes.STRING(50), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'unsubscribes', timestamps: false, indexes: [{ unique: true, fields: ['email'] }] },
  );
  return Unsubscribe;
}
