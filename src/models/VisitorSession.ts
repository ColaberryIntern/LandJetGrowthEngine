import { DataTypes, Model, Sequelize } from 'sequelize';

export class VisitorSession extends Model {
  declare id: string; declare visitor_id: string; declare started_at: Date;
  declare last_activity_at: Date; declare page_count: number; declare metadata: object | null;
}

export function initVisitorSessionModel(sequelize: Sequelize): typeof VisitorSession {
  VisitorSession.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    visitor_id: { type: DataTypes.UUID, allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_activity_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    page_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  }, { sequelize, tableName: 'visitor_sessions', timestamps: false, indexes: [{ fields: ['visitor_id'] }] });
  return VisitorSession;
}
