import { DataTypes, Model, Sequelize } from 'sequelize';

export const PAGE_CATEGORIES = [
  'homepage', 'pricing', 'program', 'contact', 'enroll', 'advisory',
  'sponsorship', 'strategy_call_prep', 'executive_overview', 'roi_calculator',
  'portal', 'alumni', 'other',
] as const;

export class PageEvent extends Model {
  declare id: string; declare session_id: string; declare visitor_id: string;
  declare event_type: string; declare page_url: string;
  declare page_category: (typeof PAGE_CATEGORIES)[number];
  declare referrer: string | null; declare metadata: object | null; declare created_at: Date;
}

export function initPageEventModel(sequelize: Sequelize): typeof PageEvent {
  PageEvent.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    visitor_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING(50), allowNull: false },
    page_url: { type: DataTypes.STRING(500), allowNull: false },
    page_category: { type: DataTypes.ENUM(...PAGE_CATEGORIES), allowNull: false, defaultValue: 'other' },
    referrer: { type: DataTypes.STRING(500), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'page_events', timestamps: false, indexes: [{ fields: ['visitor_id'] }, { fields: ['session_id'] }, { fields: ['created_at'] }] });
  return PageEvent;
}
