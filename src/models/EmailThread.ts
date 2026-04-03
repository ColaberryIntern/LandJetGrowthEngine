import { DataTypes, Model, Sequelize } from 'sequelize';

export interface ClassifiedData {
  topic: string;
  type: 'project' | 'task' | 'discussion';
  priority: 'high' | 'medium' | 'low';
  todos: string[];
  owners: string[];
  confidence: number;
}

export interface EmailThreadAttributes {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  sender: string;
  recipients: string[] | null;
  subject: string | null;
  body: string | null;
  received_at: Date;
  processed: boolean;
  skipped: boolean;
  classified_data: ClassifiedData | null;
  priority_score: number | null;
  raw_payload: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface EmailThreadCreationAttributes
  extends Omit<EmailThreadAttributes, 'id' | 'created_at' | 'updated_at' | 'processed' | 'skipped' | 'classified_data' | 'priority_score' | 'raw_payload'> {
  id?: string;
  processed?: boolean;
  skipped?: boolean;
  classified_data?: ClassifiedData | null;
  priority_score?: number | null;
  raw_payload?: object | null;
}

export class EmailThread
  extends Model<EmailThreadAttributes, EmailThreadCreationAttributes>
  implements EmailThreadAttributes
{
  declare id: string;
  declare gmail_message_id: string;
  declare gmail_thread_id: string;
  declare sender: string;
  declare recipients: string[] | null;
  declare subject: string | null;
  declare body: string | null;
  declare received_at: Date;
  declare processed: boolean;
  declare skipped: boolean;
  declare classified_data: ClassifiedData | null;
  declare priority_score: number | null;
  declare raw_payload: object | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initEmailThreadModel(sequelize: Sequelize): typeof EmailThread {
  EmailThread.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      gmail_message_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      gmail_thread_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      sender: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      recipients: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      subject: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      received_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      processed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      skipped: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      classified_data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      priority_score: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      raw_payload: {
        type: DataTypes.JSONB,
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
      tableName: 'email_threads',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['gmail_thread_id'] },
        { fields: ['sender'] },
        { fields: ['processed'] },
        { fields: ['received_at'] },
      ],
    },
  );

  return EmailThread;
}
