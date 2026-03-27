import { DataTypes, Model, Sequelize } from 'sequelize';

export interface NotificationAttributes {
  id: string;
  user_id: string;
  type: 'email' | 'in_app';
  channel: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'read' | 'failed';
  metadata: object | null;
  created_at?: Date;
  read_at: Date | null;
}

export interface NotificationCreationAttributes
  extends Omit<NotificationAttributes, 'id' | 'created_at' | 'read_at'> {
  id?: string;
  read_at?: Date | null;
}

export class Notification
  extends Model<NotificationAttributes, NotificationCreationAttributes>
  implements NotificationAttributes
{
  declare id: string;
  declare user_id: string;
  declare type: 'email' | 'in_app';
  declare channel: string;
  declare subject: string;
  declare body: string;
  declare status: 'pending' | 'sent' | 'read' | 'failed';
  declare metadata: object | null;
  declare created_at: Date;
  declare read_at: Date | null;
}

export function initNotificationModel(sequelize: Sequelize): typeof Notification {
  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('email', 'in_app'),
        allowNull: false,
      },
      channel: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'system',
      },
      subject: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'sent', 'read', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      read_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'notifications',
      timestamps: false,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['created_at'] },
      ],
    },
  );

  return Notification;
}
