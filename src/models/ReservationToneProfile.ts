import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A learned "voice" for one account. Summarized by the LLM from that mailbox's
 * mined reply exemplars, then injected into the draft generator so a reply sent
 * from percy@ sounds like Percy and one from rlandry@ sounds like Ryan. Rebuilt
 * as the corpus grows -- this is the part of the rubric that gets better over time.
 */
export class ReservationToneProfile extends Model {
  declare mailbox: string;          // primary key -- one profile per account
  declare greeting: string | null;  // e.g. "Hi {first}," vs "Good morning,"
  declare signoff: string | null;   // e.g. "Best, Percy" vs "LandJet Reservations"
  declare avg_length: number | null; // typical reply length in words
  declare formality: string | null; // short label: warm / brisk / formal
  declare guidance: string | null;  // the tone block fed into the draft prompt
  declare sample_count: number;     // how many exemplars this was built from
  declare updated_at: Date;
}

export function initReservationToneProfileModel(sequelize: Sequelize): typeof ReservationToneProfile {
  ReservationToneProfile.init(
    {
      mailbox: { type: DataTypes.TEXT, primaryKey: true },
      greeting: { type: DataTypes.TEXT, allowNull: true },
      signoff: { type: DataTypes.TEXT, allowNull: true },
      avg_length: { type: DataTypes.INTEGER, allowNull: true },
      formality: { type: DataTypes.TEXT, allowNull: true },
      guidance: { type: DataTypes.TEXT, allowNull: true },
      sample_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'reservation_tone_profiles',
      underscored: true,
      timestamps: false,
    },
  );
  return ReservationToneProfile;
}
