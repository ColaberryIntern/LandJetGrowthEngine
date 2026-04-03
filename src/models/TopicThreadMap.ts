import { DataTypes, Model, Sequelize } from 'sequelize';

export interface TopicThreadMapAttributes {
  id: string;
  gmail_thread_id: string;
  basecamp_topic_id: string | null;
  basecamp_todolist_id: string | null;
  status: 'active' | 'resolved' | 'stalled';
  last_updated: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface TopicThreadMapCreationAttributes
  extends Omit<TopicThreadMapAttributes, 'id' | 'created_at' | 'updated_at' | 'status' | 'last_updated' | 'basecamp_topic_id' | 'basecamp_todolist_id'> {
  id?: string;
  status?: 'active' | 'resolved' | 'stalled';
  last_updated?: Date | null;
  basecamp_topic_id?: string | null;
  basecamp_todolist_id?: string | null;
}

export class TopicThreadMap
  extends Model<TopicThreadMapAttributes, TopicThreadMapCreationAttributes>
  implements TopicThreadMapAttributes
{
  declare id: string;
  declare gmail_thread_id: string;
  declare basecamp_topic_id: string | null;
  declare basecamp_todolist_id: string | null;
  declare status: 'active' | 'resolved' | 'stalled';
  declare last_updated: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initTopicThreadMapModel(sequelize: Sequelize): typeof TopicThreadMap {
  TopicThreadMap.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gmail_thread_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      basecamp_topic_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      basecamp_todolist_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('active', 'resolved', 'stalled'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_updated: {
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
      tableName: 'topic_thread_maps',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['gmail_thread_id'] },
        { fields: ['basecamp_topic_id'] },
      ],
    },
  );

  return TopicThreadMap;
}
