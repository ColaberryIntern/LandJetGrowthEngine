import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * One (inbound request -> the reply a human actually sent) pair, mined from a
 * mailbox's Sent Items. This is the learning corpus: the more pairs we have for
 * an account, the better the AI can match how that person/desk really answers.
 * Keyed by the sent message id so mining is idempotent (safe to re-run).
 */
export class ReservationReplyExemplar extends Model {
  declare id: number;
  declare mailbox: string;          // which account sent the reply (whose voice this is)
  declare source_message_id: string; // Graph id of the sent reply (dedup key)
  declare conversation_id: string | null;
  declare inbound_subject: string | null;
  declare inbound_excerpt: string | null; // the customer's message we were answering
  declare reply_excerpt: string;          // what the human actually sent back
  declare sent_at: Date | null;
  declare created_at: Date;
}

export function initReservationReplyExemplarModel(sequelize: Sequelize): typeof ReservationReplyExemplar {
  ReservationReplyExemplar.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      mailbox: { type: DataTypes.TEXT, allowNull: false },
      source_message_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
      conversation_id: { type: DataTypes.TEXT, allowNull: true },
      inbound_subject: { type: DataTypes.TEXT, allowNull: true },
      inbound_excerpt: { type: DataTypes.TEXT, allowNull: true },
      reply_excerpt: { type: DataTypes.TEXT, allowNull: false },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'reservation_reply_exemplars',
      underscored: true,
      timestamps: false,
    },
  );
  return ReservationReplyExemplar;
}
