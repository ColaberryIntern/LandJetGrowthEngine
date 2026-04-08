import { DataTypes, Model, Sequelize } from 'sequelize';

export const JOB_TYPES = ['scheduler', 'agent', 'draft_engine', 'repair', 'health_scan'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['running', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobExecutionAttributes {
  id: string;
  job_name: string;
  job_type: JobType;
  status: JobStatus;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  result: object | null;
  error_message: string | null;
  metadata: object | null;
  created_at?: Date;
}

export interface JobExecutionCreationAttributes
  extends Omit<JobExecutionAttributes, 'id' | 'created_at' | 'completed_at' | 'duration_ms' | 'result' | 'error_message'> {
  id?: string;
  completed_at?: Date | null;
  duration_ms?: number | null;
  result?: object | null;
  error_message?: string | null;
}

export class JobExecution
  extends Model<JobExecutionAttributes, JobExecutionCreationAttributes>
  implements JobExecutionAttributes
{
  declare id: string;
  declare job_name: string;
  declare job_type: JobType;
  declare status: JobStatus;
  declare started_at: Date;
  declare completed_at: Date | null;
  declare duration_ms: number | null;
  declare result: object | null;
  declare error_message: string | null;
  declare metadata: object | null;
  declare created_at: Date;
}

export function initJobExecutionModel(sequelize: Sequelize): typeof JobExecution {
  JobExecution.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      job_name: { type: DataTypes.STRING(255), allowNull: false },
      job_type: { type: DataTypes.ENUM(...JOB_TYPES), allowNull: false },
      status: { type: DataTypes.ENUM(...JOB_STATUSES), allowNull: false, defaultValue: 'running' },
      started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      duration_ms: { type: DataTypes.INTEGER, allowNull: true },
      result: { type: DataTypes.JSONB, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: 'job_executions',
      timestamps: false,
      indexes: [
        { fields: ['job_name'] },
        { fields: ['status'] },
        { fields: ['started_at'] },
        { fields: ['job_type'] },
      ],
    },
  );
  return JobExecution;
}
