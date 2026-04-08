import { Op } from 'sequelize';
import { generateMessage } from '../services/aiMessageService';
import { registerAgent, getAgent } from '../intelligence/agents/agentRegistry';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { AiAgent } from '../models/AiAgent';
import { createNotification } from '../services/notificationService';
import { logger } from '../config/logger';

export interface UserAuditInput {
  userId: string;
  email: string;
  role: string;
  recentActions: { action: string; entity_type: string; created_at: string }[];
  lastLoginAt: string | null;
  accountAge: number; // days
}

export interface UserAuditAnalysis {
  risk_level: 'low' | 'medium' | 'high';
  activity_status: 'active' | 'inactive' | 'dormant';
  recommendations: string[];
  priority_score: number;
}

/**
 * Rule-based fallback for user audit.
 */
function auditWithRules(input: UserAuditInput): UserAuditAnalysis {
  const recommendations: string[] = [];
  let riskLevel: UserAuditAnalysis['risk_level'] = 'low';
  let activityStatus: UserAuditAnalysis['activity_status'] = 'active';
  let priority = 0;

  // Check login recency
  if (!input.lastLoginAt) {
    activityStatus = 'dormant';
    recommendations.push('User has never logged in — consider sending activation reminder');
    priority += 20;
  } else {
    const daysSinceLogin = (Date.now() - new Date(input.lastLoginAt).getTime()) / (86400 * 1000);
    if (daysSinceLogin > 30) {
      activityStatus = 'dormant';
      recommendations.push(`Last login was ${Math.round(daysSinceLogin)} days ago — account may be abandoned`);
      priority += 25;
    } else if (daysSinceLogin > 7) {
      activityStatus = 'inactive';
      priority += 10;
    }
  }

  // Check admin role with no recent activity
  if (input.role === 'admin' && input.recentActions.length === 0) {
    riskLevel = 'medium';
    recommendations.push('Admin account with no recent activity — verify account is still needed');
    priority += 30;
  }

  // Check for unusual action volume
  if (input.recentActions.length > 100) {
    riskLevel = 'high';
    recommendations.push(`Unusually high activity (${input.recentActions.length} actions) — review for automated/unauthorized usage`);
    priority += 40;
  }

  if (recommendations.length === 0) {
    recommendations.push('Account activity within normal range');
  }

  return {
    risk_level: riskLevel,
    activity_status: activityStatus,
    recommendations,
    priority_score: Math.min(priority, 100),
  };
}

/**
 * Audit a single user's account for security and activity.
 */
export async function auditUser(input: UserAuditInput): Promise<UserAuditAnalysis> {
  const agent = await getAgent('user_management');
  if (agent && !agent.enabled) {
    return auditWithRules(input);
  }

  try {
    const result = await generateMessage({
      channel: 'email',
      ai_instructions: `Analyze this user account and return ONLY valid JSON:
{
  "risk_level": "low" | "medium" | "high",
  "activity_status": "active" | "inactive" | "dormant",
  "recommendations": ["recommendation 1", ...],
  "priority_score": 0-100
}

User Data:
- Email: ${input.email}
- Role: ${input.role}
- Account age: ${input.accountAge} days
- Last login: ${input.lastLoginAt || 'never'}
- Recent actions (${input.recentActions.length}): ${JSON.stringify(input.recentActions.slice(0, 10))}

Evaluate: Is this account active? Any security concerns? Should permissions be reviewed?`,
      lead: { name: input.email },
    });

    return JSON.parse(result.body) as UserAuditAnalysis;
  } catch (error) {
    logger.warn('User audit AI failed, using rules', { userId: input.userId, error: (error as Error).message });
    return auditWithRules(input);
  }
}

/**
 * Run a full user management audit cycle.
 */
export async function runUserManagementCycle(): Promise<{ audited: number; alerts: number; errors: number }> {
  const agent = await getAgent('user_management');
  if (agent && !agent.enabled) {
    logger.info('User management agent disabled, skipping');
    return { audited: 0, alerts: 0, errors: 0 };
  }

  let audited = 0;
  let alerts = 0;
  let errors = 0;

  try {
    const users = await User.findAll({ where: { status: 'active' } });
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const user of users) {
      try {
        const recentLogs = await AuditLog.findAll({
          where: { user_id: user.id, created_at: { [Op.gte]: sevenDaysAgo } },
          order: [['created_at', 'DESC']],
          limit: 50,
          raw: true,
        }) as any[];

        const accountAge = Math.round((Date.now() - new Date(user.created_at).getTime()) / (86400 * 1000));

        const analysis = await auditUser({
          userId: user.id,
          email: user.email,
          role: user.role,
          recentActions: recentLogs.map((l: any) => ({
            action: l.action,
            entity_type: l.entity_type,
            created_at: l.created_at,
          })),
          lastLoginAt: user.last_login_at?.toISOString() || null,
          accountAge,
        });

        audited++;

        if (analysis.priority_score >= 50) {
          const admins = await User.findAll({ where: { role: 'admin', status: 'active' } });
          for (const admin of admins) {
            await createNotification({
              user_id: admin.id,
              type: 'in_app',
              subject: `User Audit Alert: ${user.email}`,
              body: `Risk: ${analysis.risk_level}, Status: ${analysis.activity_status}. ${analysis.recommendations[0]}`,
            });
          }
          alerts++;
        }
      } catch (error) {
        errors++;
        logger.error('User audit failed', { userId: user.id, error: (error as Error).message });
      }
    }
  } catch (error) {
    errors++;
    logger.error('User management cycle failed', { error: (error as Error).message });
  }

  logger.info('User management cycle complete', { audited, alerts, errors });
  return { audited, alerts, errors };
}

/**
 * Register the user management agent.
 */
export async function registerUserManagementAgent(): Promise<AiAgent> {
  return registerAgent({
    name: 'user_management',
    type: 'security_audit',
    department: 'operations',
    schedule: 'daily',
    config: { model: 'gpt-4o', max_tokens: 512 },
    enabled: true,
  });
}
