import { DataTypes, Model, Sequelize } from 'sequelize';

export const PIPELINE_STAGES = [
  'new_lead',
  'contacted',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
  'enrolled',
  'lost',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_ORDER: Record<PipelineStage, number> = {
  new_lead: 0,
  contacted: 1,
  meeting_scheduled: 2,
  proposal_sent: 3,
  negotiation: 4,
  enrolled: 5,
  lost: 6,
};

export interface LeadAttributes {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  industry: string | null;
  company_size: number | null;
  annual_revenue: number | null;
  linkedin_url: string | null;
  lead_source: string | null;
  lead_source_type: string | null;
  temperature: 'cold' | 'warm' | 'hot';
  lead_score: number;
  lifecycle_stage: string | null;
  pipeline_stage: PipelineStage;
  notes: object | null;
  technology_stack: string[] | null;
  utm_source: string | null;
  interest_area: string | null;
  status: 'active' | 'inactive' | 'archived';
  created_at?: Date;
  updated_at?: Date;
}

export interface LeadCreationAttributes
  extends Omit<LeadAttributes, 'id' | 'created_at' | 'updated_at' | 'lead_score'> {
  lead_score?: number;
}

export class Lead
  extends Model<LeadAttributes, LeadCreationAttributes>
  implements LeadAttributes
{
  declare id: number;
  declare first_name: string;
  declare last_name: string;
  declare email: string;
  declare phone: string | null;
  declare company: string | null;
  declare title: string | null;
  declare industry: string | null;
  declare company_size: number | null;
  declare annual_revenue: number | null;
  declare linkedin_url: string | null;
  declare lead_source: string | null;
  declare lead_source_type: string | null;
  declare temperature: 'cold' | 'warm' | 'hot';
  declare lead_score: number;
  declare lifecycle_stage: string | null;
  declare pipeline_stage: PipelineStage;
  declare notes: object | null;
  declare technology_stack: string[] | null;
  declare utm_source: string | null;
  declare interest_area: string | null;
  declare status: 'active' | 'inactive' | 'archived';
  declare created_at: Date;
  declare updated_at: Date;
}

export function initLeadModel(sequelize: Sequelize): typeof Lead {
  Lead.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      company: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      industry: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      company_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      annual_revenue: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
      },
      linkedin_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      lead_source: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      lead_source_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      temperature: {
        type: DataTypes.ENUM('cold', 'warm', 'hot'),
        allowNull: false,
        defaultValue: 'cold',
      },
      lead_score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lifecycle_stage: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      pipeline_stage: {
        type: DataTypes.ENUM(...PIPELINE_STAGES),
        allowNull: false,
        defaultValue: 'new_lead',
      },
      notes: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      technology_stack: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: true,
      },
      utm_source: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      interest_area: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'archived'),
        allowNull: false,
        defaultValue: 'active',
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
      tableName: 'leads',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['email'] },
        { fields: ['pipeline_stage'] },
        { fields: ['lead_score'] },
        { fields: ['temperature'] },
        { fields: ['status'] },
        { fields: ['industry'] },
        { fields: ['lead_source_type'] },
      ],
    },
  );

  return Lead;
}
