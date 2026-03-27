import { DataTypes, Model, Sequelize } from 'sequelize';

export class Visitor extends Model {
  declare id: string; declare fingerprint: string; declare lead_id: number | null;
  declare first_seen_at: Date; declare last_seen_at: Date; declare metadata: object | null;
}

export function initVisitorModel(sequelize: Sequelize): typeof Visitor {
  Visitor.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    fingerprint: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    lead_id: { type: DataTypes.INTEGER, allowNull: true },
    first_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  }, { sequelize, tableName: 'visitors', timestamps: false });
  return Visitor;
}
