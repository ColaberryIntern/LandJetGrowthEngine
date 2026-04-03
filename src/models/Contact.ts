import { DataTypes, Model, Sequelize } from 'sequelize';

export interface ContactAttributes {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  relationship_type: string;
  sequence_stage: number;
  last_contacted_at: Date | null;
  next_action_at: Date | null;
  status: string;
  priority_score: number;
  vertical: string | null;
  tier: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ContactCreationAttributes
  extends Omit<ContactAttributes, 'id' | 'created_at' | 'updated_at' | 'sequence_stage' | 'relationship_type' | 'status' | 'priority_score' | 'vertical' | 'tier'> {
  id?: string;
  sequence_stage?: number;
  relationship_type?: string;
  status?: string;
  priority_score?: number;
  vertical?: string | null;
  tier?: number | null;
}

export class Contact
  extends Model<ContactAttributes, ContactCreationAttributes>
  implements ContactAttributes
{
  declare id: string;
  declare name: string;
  declare email: string;
  declare phone: string | null;
  declare company: string | null;
  declare relationship_type: string;
  declare sequence_stage: number;
  declare last_contacted_at: Date | null;
  declare next_action_at: Date | null;
  declare status: string;
  declare priority_score: number;
  declare vertical: string | null;
  declare tier: number | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initContactModel(sequelize: Sequelize): typeof Contact {
  Contact.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      company: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      relationship_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'PAST_CLIENT',
      },
      sequence_stage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      last_contacted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      next_action_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      priority_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      vertical: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      tier: {
        type: DataTypes.INTEGER,
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
      tableName: 'contacts',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['email'], unique: true },
        { fields: ['status'] },
        { fields: ['next_action_at'] },
        { fields: ['priority_score'] },
        { fields: ['vertical'] },
        { fields: ['tier'] },
      ],
    },
  );

  return Contact;
}
