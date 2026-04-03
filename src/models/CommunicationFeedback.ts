import { DataTypes, Model, Sequelize } from 'sequelize';

export interface CommunicationFeedbackAttributes {
  id: string;
  topic_thread_map_id: string;
  todos_created: number;
  todos_completed: number;
  is_recurring: boolean;
  recurrence_count: number;
  last_activity: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CommunicationFeedbackCreationAttributes
  extends Omit<CommunicationFeedbackAttributes, 'id' | 'created_at' | 'updated_at' | 'todos_created' | 'todos_completed' | 'is_recurring' | 'recurrence_count' | 'last_activity'> {
  id?: string;
  todos_created?: number;
  todos_completed?: number;
  is_recurring?: boolean;
  recurrence_count?: number;
  last_activity?: Date | null;
}

export class CommunicationFeedback
  extends Model<CommunicationFeedbackAttributes, CommunicationFeedbackCreationAttributes>
  implements CommunicationFeedbackAttributes
{
  declare id: string;
  declare topic_thread_map_id: string;
  declare todos_created: number;
  declare todos_completed: number;
  declare is_recurring: boolean;
  declare recurrence_count: number;
  declare last_activity: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initCommunicationFeedbackModel(sequelize: Sequelize): typeof CommunicationFeedback {
  CommunicationFeedback.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      topic_thread_map_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'topic_thread_maps', key: 'id' },
      },
      todos_created: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      todos_completed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_recurring: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      recurrence_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_activity: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'communication_feedback',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['topic_thread_map_id'] },
      ],
    },
  );

  return CommunicationFeedback;
}
