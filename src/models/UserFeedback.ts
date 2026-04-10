import { DataTypes, Model, Sequelize } from 'sequelize';

export const FEEDBACK_TYPES = ['bug', 'feature_request', 'usability', 'general', 'accessibility', 'privacy'] as const;
export const FEEDBACK_STATUSES = ['submitted', 'reviewed', 'in_progress', 'resolved', 'declined'] as const;

export interface UserFeedbackAttributes {
  id: string;
  user_id: string | null;
  type: (typeof FEEDBACK_TYPES)[number];
  status: (typeof FEEDBACK_STATUSES)[number];
  subject: string;
  body: string;
  rating: number | null;
  page_context: string | null;
  resolved_at: Date | null;
  response: string | null;
  metadata: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserFeedbackCreation extends Omit<UserFeedbackAttributes, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'response'> {
  id?: string; resolved_at?: Date | null; response?: string | null;
}

export class UserFeedback extends Model<UserFeedbackAttributes, UserFeedbackCreation> implements UserFeedbackAttributes {
  declare id: string; declare user_id: string | null;
  declare type: (typeof FEEDBACK_TYPES)[number]; declare status: (typeof FEEDBACK_STATUSES)[number];
  declare subject: string; declare body: string; declare rating: number | null;
  declare page_context: string | null; declare resolved_at: Date | null;
  declare response: string | null; declare metadata: object | null;
  declare created_at: Date; declare updated_at: Date;
}

export function initUserFeedbackModel(sequelize: Sequelize): typeof UserFeedback {
  UserFeedback.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM(...FEEDBACK_TYPES), allowNull: false },
    status: { type: DataTypes.ENUM(...FEEDBACK_STATUSES), allowNull: false, defaultValue: 'submitted' },
    subject: { type: DataTypes.STRING(500), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: true },
    page_context: { type: DataTypes.STRING(255), allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    response: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'user_feedback', timestamps: true, underscored: true,
    indexes: [{ fields: ['type'] }, { fields: ['status'] }, { fields: ['user_id'] }],
  });
  return UserFeedback;
}
