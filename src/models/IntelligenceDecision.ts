import { DataTypes, Model, Sequelize } from 'sequelize';

export const RECOMMENDED_ACTIONS = [
  'update_campaign_config', 'adjust_lead_scoring', 'launch_ab_test',
  'pause_campaign', 'update_agent_config', 'modify_agent_schedule',
] as const;

export const EXECUTION_STATUSES = [
  'proposed', 'approved', 'executing', 'executed', 'rejected', 'failed', 'rolled_back',
] as const;

export const RISK_TIERS = ['safe', 'moderate', 'risky', 'dangerous'] as const;

export interface IntelligenceDecisionAttributes {
  decision_id: string;
  trace_id: string;
  problem_detected: string;
  analysis_summary: string;
  recommended_action: (typeof RECOMMENDED_ACTIONS)[number];
  action_details: object | null;
  risk_score: number;
  confidence_score: number;
  risk_tier: (typeof RISK_TIERS)[number];
  execution_status: (typeof EXECUTION_STATUSES)[number];
  executed_at: Date | null;
  executed_by: string | null;
  before_state: object | null;
  after_state: object | null;
  impact_after_24h: object | null;
  monitor_results: object | null;
  reasoning: string | null;
  observation_count: number;
  created_at?: Date;
  updated_at?: Date;
}

export class IntelligenceDecision extends Model<IntelligenceDecisionAttributes> implements IntelligenceDecisionAttributes {
  declare decision_id: string; declare trace_id: string; declare problem_detected: string;
  declare analysis_summary: string; declare recommended_action: (typeof RECOMMENDED_ACTIONS)[number];
  declare action_details: object | null; declare risk_score: number; declare confidence_score: number;
  declare risk_tier: (typeof RISK_TIERS)[number]; declare execution_status: (typeof EXECUTION_STATUSES)[number];
  declare executed_at: Date | null; declare executed_by: string | null; declare before_state: object | null;
  declare after_state: object | null; declare impact_after_24h: object | null;
  declare monitor_results: object | null; declare reasoning: string | null;
  declare observation_count: number; declare created_at: Date; declare updated_at: Date;
}

export function initIntelligenceDecisionModel(sequelize: Sequelize): typeof IntelligenceDecision {
  IntelligenceDecision.init({
    decision_id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    trace_id: { type: DataTypes.UUID, allowNull: false },
    problem_detected: { type: DataTypes.TEXT, allowNull: false },
    analysis_summary: { type: DataTypes.TEXT, allowNull: false },
    recommended_action: { type: DataTypes.ENUM(...RECOMMENDED_ACTIONS), allowNull: false },
    action_details: { type: DataTypes.JSONB, allowNull: true },
    risk_score: { type: DataTypes.INTEGER, allowNull: false },
    confidence_score: { type: DataTypes.INTEGER, allowNull: false },
    risk_tier: { type: DataTypes.ENUM(...RISK_TIERS), allowNull: false },
    execution_status: { type: DataTypes.ENUM(...EXECUTION_STATUSES), allowNull: false, defaultValue: 'proposed' },
    executed_at: { type: DataTypes.DATE, allowNull: true },
    executed_by: { type: DataTypes.STRING(255), allowNull: true },
    before_state: { type: DataTypes.JSONB, allowNull: true },
    after_state: { type: DataTypes.JSONB, allowNull: true },
    impact_after_24h: { type: DataTypes.JSONB, allowNull: true },
    monitor_results: { type: DataTypes.JSONB, allowNull: true },
    reasoning: { type: DataTypes.TEXT, allowNull: true },
    observation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: 'intelligence_decisions', timestamps: true, underscored: true });
  return IntelligenceDecision;
}
