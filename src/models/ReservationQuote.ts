import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A reservation email pulled from the booking mailbox (ljreservations@landjet.com)
 * and priced by the quote engine. One row per inbound BookRides email, keyed by
 * its Graph message id so ingestion is idempotent.
 *
 * status:
 *   auto_ready    -- priced with high confidence; safe for 1-click send
 *   needs_review  -- priced but incomplete (miles unknown) or complex; human first
 *   forward       -- forward-only market (e.g. KC); route to the local team
 *   manual        -- not a parseable BookRides quote (FAQ / other); human handles
 */
export type ReservationQuoteStatus = 'auto_ready' | 'needs_review' | 'forward' | 'manual';

export class ReservationQuote extends Model {
  declare id: number;
  declare graph_message_id: string;
  declare mailbox: string;
  declare subject: string | null;
  declare from_email: string | null;
  declare received_at: Date | null;
  declare raw_body: string | null;
  declare mode: string;
  declare market: string | null;
  declare quote_total: string | null; // DECIMAL -> string in pg
  declare currency: string;
  declare confidence: string;          // DECIMAL -> string in pg
  declare status: ReservationQuoteStatus;
  declare result: Record<string, unknown> | null;
  declare conversation_id: string | null; // Graph thread id, for reply detection
  declare responded_at: Date | null;      // when the customer next replied in the thread
  declare created_at: Date;
  declare updated_at: Date;
}

export function initReservationQuoteModel(sequelize: Sequelize): typeof ReservationQuote {
  ReservationQuote.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      graph_message_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
      mailbox: { type: DataTypes.TEXT, allowNull: false },
      subject: { type: DataTypes.TEXT, allowNull: true },
      from_email: { type: DataTypes.TEXT, allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: true },
      raw_body: { type: DataTypes.TEXT, allowNull: true },
      mode: { type: DataTypes.TEXT, allowNull: false },
      market: { type: DataTypes.TEXT, allowNull: true },
      quote_total: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      currency: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'USD' },
      confidence: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'manual' },
      result: { type: DataTypes.JSONB, allowNull: true },
      conversation_id: { type: DataTypes.TEXT, allowNull: true },
      responded_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'reservation_quotes',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  );
  return ReservationQuote;
}
