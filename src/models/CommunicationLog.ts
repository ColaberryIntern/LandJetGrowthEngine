import { DataTypes, Model, Sequelize } from 'sequelize';

export const COMM_LOG_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'] as const;
export const DELIVERY_MODES = ['live', 'simulated', 'test'] as const;
export const DIRECTIONS = ['outbound', 'inbound'] as const;

export interface CommunicationLogAttributes {
  id: string;
  lead_id: number;
  campaign_id: string | null;
  channel: 'email' | 'sms' | 'voice';
  direction: 'outbound' | 'inbound';
  delivery_mode: 'live' | 'simulated' | 'test';
  status: (typeof COMM_LOG_STATUSES)[number];
  to_address: string | null;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_response: object | null;
  metadata: object | null;
  created_at?: Date;
}

export interface CommunicationLogCreationAttributes
  extends Omit<CommunicationLogAttributes, 'id' | 'created_at'> {
  id?: string;
}

export class CommunicationLog
  extends Model<CommunicationLogAttributes, CommunicationLogCreationAttributes>
  implements CommunicationLogAttributes
{
  declare id: string;
  declare lead_id: number;
  declare campaign_id: string | null;
  declare channel: 'email' | 'sms' | 'voice';
  declare direction: 'outbound' | 'inbound';
  declare delivery_mode: 'live' | 'simulated' | 'test';
  declare status: (typeof COMM_LOG_STATUSES)[number];
  declare to_address: string | null;
  declare from_address: string | null;
  declare subject: string | null;
  declare body: string | null;
  declare provider: string | null;
  declare provider_message_id: string | null;
  declare provider_response: object | null;
  declare metadata: object | null;
  declare created_at: Date;
}

export function initCommunicationLogModel(sequelize: Sequelize): typeof CommunicationLog {
  CommunicationLog.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull: false },
      campaign_id: { type: DataTypes.UUID, allowNull: true },
      channel: { type: DataTypes.ENUM('email', 'sms', 'voice'), allowNull: false },
      direction: { type: DataTypes.ENUM(...DIRECTIONS), allowNull: false, defaultValue: 'outbound' },
      delivery_mode: { type: DataTypes.ENUM(...DELIVERY_MODES), allowNull: false, defaultValue: 'live' },
      status: { type: DataTypes.ENUM(...COMM_LOG_STATUSES), allowNull: false },
      to_address: { type: DataTypes.STRING(255), allowNull: true },
      from_address: { type: DataTypes.STRING(255), allowNull: true },
      subject: { type: DataTypes.STRING(255), allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: true },
      provider: { type: DataTypes.STRING(50), allowNull: true },
      provider_message_id: { type: DataTypes.STRING(255), allowNull: true },
      provider_response: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'communication_logs',
      timestamps: false,
      indexes: [
        { fields: ['lead_id'] },
        { fields: ['campaign_id'] },
        { fields: ['channel'] },
        { fields: ['status'] },
        { fields: ['created_at'] },
      ],
    },
  );
  return CommunicationLog;
}
