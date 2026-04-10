import { DataTypes, Model, Sequelize } from 'sequelize';

export const CONSENT_TYPES = ['data_processing', 'marketing_emails', 'analytics_tracking', 'third_party_sharing'] as const;

export interface UserConsentAttributes {
  id: string;
  user_id: string;
  consent_type: (typeof CONSENT_TYPES)[number];
  granted: boolean;
  granted_at: Date | null;
  revoked_at: Date | null;
  ip_address: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserConsentCreation extends Omit<UserConsentAttributes, 'id' | 'created_at' | 'updated_at' | 'revoked_at'> {
  id?: string; revoked_at?: Date | null;
}

export class UserConsent extends Model<UserConsentAttributes, UserConsentCreation> implements UserConsentAttributes {
  declare id: string; declare user_id: string;
  declare consent_type: (typeof CONSENT_TYPES)[number]; declare granted: boolean;
  declare granted_at: Date | null; declare revoked_at: Date | null;
  declare ip_address: string | null; declare created_at: Date; declare updated_at: Date;
}

export function initUserConsentModel(sequelize: Sequelize): typeof UserConsent {
  UserConsent.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    consent_type: { type: DataTypes.ENUM(...CONSENT_TYPES), allowNull: false },
    granted: { type: DataTypes.BOOLEAN, allowNull: false },
    granted_at: { type: DataTypes.DATE, allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'user_consents', timestamps: true, underscored: true,
    indexes: [{ fields: ['user_id'] }, { fields: ['consent_type'] }, { unique: true, fields: ['user_id', 'consent_type'] }],
  });
  return UserConsent;
}
