import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * A piece of operator feedback on the outreach system -- what Ryan (or any
 * sender) thinks is wrong, in their own words. Free-form text is triaged by an
 * LLM into a bounded, safe action; the structured part is applied automatically
 * where safe, and everything is stored here as training data + audit trail.
 *
 * `contact_id` is optional: header-level feedback ("messages are too long") has
 * none, while a per-contact report ("don't contact this person") carries one.
 * `triage` holds the raw LLM assessment so a human can see why an action was
 * chosen. `status` records whether the action was applied, held for review, or
 * failed.
 */
export class OutreachFeedback extends Model {
  declare id: number;
  declare contact_id: string | null;       // outreach contact/lead id, if reported from a card
  declare category: string;                // message_too_long | wrong_wording | wrong_signature | ...
  declare comment: string | null;          // free text: exactly what's wrong, in Ryan's words
  declare triage: Record<string, unknown> | null; // raw LLM assessment { action, params, summary, confidence }
  declare action: string | null;           // bounded action chosen: add_guardrail | update_setting | block_contact | ...
  declare applied: string | null;          // plain-language summary of what changed (or why it was held)
  declare status: string;                  // applied | needs_review | failed
  declare created_by: string | null;
  declare created_at: Date;
}

export function initOutreachFeedbackModel(sequelize: Sequelize): typeof OutreachFeedback {
  OutreachFeedback.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      contact_id: { type: DataTypes.TEXT, allowNull: true },
      category: { type: DataTypes.TEXT, allowNull: false },
      comment: { type: DataTypes.TEXT, allowNull: true },
      triage: { type: DataTypes.JSONB, allowNull: true },
      action: { type: DataTypes.TEXT, allowNull: true },
      applied: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'needs_review' },
      created_by: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'outreach_feedback', underscored: true, timestamps: false },
  );
  return OutreachFeedback;
}
