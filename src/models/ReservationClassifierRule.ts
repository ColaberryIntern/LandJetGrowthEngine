import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A learned classification rule derived from a human correction: "mail from this
 * domain is never a quote", or "mail from this address IS a quote". The ingest
 * classifier consults these before its heuristic, so a correction made once is
 * never repeated. This is how the queue gets smarter the more it is used.
 */
export class ReservationClassifierRule extends Model {
  declare id: number;
  declare pattern_type: 'sender_domain' | 'sender_email';
  declare pattern_value: string;
  declare decision: 'not_quote' | 'quote';
  declare source: string | null;   // 'reclassify' | 'feedback'
  declare hit_count: number;
  declare updated_at: Date;
}

export function initReservationClassifierRuleModel(sequelize: Sequelize): typeof ReservationClassifierRule {
  ReservationClassifierRule.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      pattern_type: { type: DataTypes.TEXT, allowNull: false },
      pattern_value: { type: DataTypes.TEXT, allowNull: false },
      decision: { type: DataTypes.TEXT, allowNull: false },
      source: { type: DataTypes.TEXT, allowNull: true },
      hit_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'reservation_classifier_rules', underscored: true, timestamps: false },
  );
  return ReservationClassifierRule;
}
