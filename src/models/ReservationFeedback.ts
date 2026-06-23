import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A piece of operator feedback on one reservation -- what was wrong, in their
 * words, plus the category and any structured correction applied. This is the
 * training data: the more the team reports, the better the system gets, without
 * anyone having to chase down an engineer.
 */
export class ReservationFeedback extends Model {
  declare id: number;
  declare reservation_id: number;
  declare category: string;       // misclassified | wrong_price | wrong_route | wrong_trip | wrong_reply | wrong_status | other
  declare comment: string | null; // free text: exactly what's wrong
  declare action: string | null;  // structured correction applied, if any
  declare created_by: string | null;
  declare created_at: Date;
}

export function initReservationFeedbackModel(sequelize: Sequelize): typeof ReservationFeedback {
  ReservationFeedback.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      reservation_id: { type: DataTypes.INTEGER, allowNull: false },
      category: { type: DataTypes.TEXT, allowNull: false },
      comment: { type: DataTypes.TEXT, allowNull: true },
      action: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'reservation_feedback', underscored: true, timestamps: false },
  );
  return ReservationFeedback;
}
