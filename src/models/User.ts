import { DataTypes, Model, Sequelize } from 'sequelize';

export type TerritoryDefault = 'tx_only' | 'non_tx' | 'all';

export interface UserAttributes {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'account_manager' | 'manager' | 'user';
  status: 'active' | 'inactive' | 'suspended';
  email_verified: boolean;
  verification_token: string | null;
  api_token: string | null; // long-lived bearer for Chrome extension / scripted clients
  territory_default: TerritoryDefault;
  default_filters: Record<string, unknown>;
  last_login_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserCreationAttributes
  extends Omit<UserAttributes, 'id' | 'created_at' | 'updated_at' | 'last_login_at' | 'email_verified' | 'verification_token' | 'api_token' | 'territory_default' | 'default_filters'> {
  id?: string;
  last_login_at?: Date | null;
  email_verified?: boolean;
  verification_token?: string | null;
  api_token?: string | null;
  territory_default?: TerritoryDefault;
  default_filters?: Record<string, unknown>;
}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare password_hash: string;
  declare first_name: string;
  declare last_name: string;
  declare role: 'admin' | 'account_manager' | 'manager' | 'user';
  declare status: 'active' | 'inactive' | 'suspended';
  declare email_verified: boolean;
  declare verification_token: string | null;
  declare api_token: string | null;
  declare territory_default: TerritoryDefault;
  declare default_filters: Record<string, unknown>;
  declare last_login_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('admin', 'account_manager', 'manager', 'user'),
        allowNull: false,
        defaultValue: 'user',
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
      email_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      verification_token: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      api_token: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      territory_default: {
        type: DataTypes.ENUM('tx_only', 'non_tx', 'all'),
        allowNull: false,
        defaultValue: 'all',
      },
      default_filters: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      last_login_at: {
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
      tableName: 'users',
      timestamps: true,
      underscored: true,
    },
  );

  return User;
}
