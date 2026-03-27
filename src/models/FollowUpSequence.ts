import { DataTypes, Model, Sequelize } from 'sequelize';

export interface SequenceStep {
  delay_days: number;
  minutes_before_call?: number;
  days_before_cohort_start?: number;
  channel: 'email' | 'voice' | 'sms';
  subject: string;
  body_template: string;
  ai_instructions: string;
  ai_tone: string;
  ai_context_notes?: string;
  step_goal?: string;
  max_attempts: number;
  fallback_channel?: 'email' | 'sms';
  voice_agent_type?: 'welcome' | 'interest';
  voice_prompt?: string;
}

export interface FollowUpSequenceAttributes {
  id: string;
  name: string;
  description: string | null;
  steps: SequenceStep[];
  created_at?: Date;
  updated_at?: Date;
}

export interface FollowUpSequenceCreationAttributes
  extends Omit<FollowUpSequenceAttributes, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
}

export class FollowUpSequence
  extends Model<FollowUpSequenceAttributes, FollowUpSequenceCreationAttributes>
  implements FollowUpSequenceAttributes
{
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare steps: SequenceStep[];
  declare created_at: Date;
  declare updated_at: Date;
}

export function initFollowUpSequenceModel(sequelize: Sequelize): typeof FollowUpSequence {
  FollowUpSequence.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      steps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'follow_up_sequences',
      timestamps: true,
      underscored: true,
    },
  );
  return FollowUpSequence;
}
