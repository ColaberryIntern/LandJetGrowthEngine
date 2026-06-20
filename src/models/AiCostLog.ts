import { DataTypes, Model, Sequelize } from 'sequelize';

/**
 * One row per LLM call: tokens + computed USD cost + provenance. Closes audit
 * gap G4 (no cost observability). Written fail-soft from a shared helper at
 * every OpenAI call site; read by the Trust Command Center.
 */
export class AiCostLog extends Model {
  declare id: number;
  declare source: string;        // logical call site, e.g. 'draft_writer', 'nl_extraction'
  declare model: string;
  declare input_tokens: number | null;
  declare output_tokens: number | null;
  declare total_tokens: number | null;
  declare usd: string | null;    // DECIMAL -> string
  declare status: string;        // 'success' | 'failed'
  declare trace_id: string | null;
  declare user_id: string | null;
  declare created_at: Date;
}

export function initAiCostLogModel(sequelize: Sequelize): typeof AiCostLog {
  AiCostLog.init(
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      source: { type: DataTypes.TEXT, allowNull: false },
      model: { type: DataTypes.TEXT, allowNull: false },
      input_tokens: { type: DataTypes.INTEGER, allowNull: true },
      output_tokens: { type: DataTypes.INTEGER, allowNull: true },
      total_tokens: { type: DataTypes.INTEGER, allowNull: true },
      usd: { type: DataTypes.DECIMAL(10, 5), allowNull: true },
      status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'success' },
      trace_id: { type: DataTypes.TEXT, allowNull: true },
      user_id: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { sequelize, tableName: 'ai_cost_log', underscored: true, timestamps: false },
  );
  return AiCostLog;
}
