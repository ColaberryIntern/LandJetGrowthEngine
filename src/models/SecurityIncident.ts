import { DataTypes, Model, Sequelize } from 'sequelize';

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const INCIDENT_STATUSES = ['open', 'investigating', 'mitigated', 'resolved', 'closed'] as const;
export const INCIDENT_TYPES = ['unauthorized_access', 'data_breach', 'service_outage', 'rate_limit_abuse', 'suspicious_activity', 'configuration_error', 'other'] as const;

export interface SecurityIncidentAttributes {
  id: string;
  title: string;
  description: string | null;
  incident_type: (typeof INCIDENT_TYPES)[number];
  severity: (typeof INCIDENT_SEVERITIES)[number];
  status: (typeof INCIDENT_STATUSES)[number];
  reported_by: string | null;
  assigned_to: string | null;
  resolution: string | null;
  resolved_at: Date | null;
  metadata: object | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface SecurityIncidentCreation extends Omit<SecurityIncidentAttributes, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'resolution' | 'assigned_to'> {
  id?: string;
  resolved_at?: Date | null;
  resolution?: string | null;
  assigned_to?: string | null;
}

export class SecurityIncident extends Model<SecurityIncidentAttributes, SecurityIncidentCreation> implements SecurityIncidentAttributes {
  declare id: string;
  declare title: string;
  declare description: string | null;
  declare incident_type: (typeof INCIDENT_TYPES)[number];
  declare severity: (typeof INCIDENT_SEVERITIES)[number];
  declare status: (typeof INCIDENT_STATUSES)[number];
  declare reported_by: string | null;
  declare assigned_to: string | null;
  declare resolution: string | null;
  declare resolved_at: Date | null;
  declare metadata: object | null;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initSecurityIncidentModel(sequelize: Sequelize): typeof SecurityIncident {
  SecurityIncident.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    incident_type: { type: DataTypes.ENUM(...INCIDENT_TYPES), allowNull: false },
    severity: { type: DataTypes.ENUM(...INCIDENT_SEVERITIES), allowNull: false, defaultValue: 'medium' },
    status: { type: DataTypes.ENUM(...INCIDENT_STATUSES), allowNull: false, defaultValue: 'open' },
    reported_by: { type: DataTypes.UUID, allowNull: true },
    assigned_to: { type: DataTypes.UUID, allowNull: true },
    resolution: { type: DataTypes.TEXT, allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    sequelize, tableName: 'security_incidents', timestamps: true, underscored: true,
    indexes: [{ fields: ['status'] }, { fields: ['severity'] }, { fields: ['incident_type'] }],
  });
  return SecurityIncident;
}
