import { Sequelize } from 'sequelize';
import { initUserModel, User } from './User';
import { initSystemSettingModel, SystemSetting } from './SystemSetting';
import { initAuditLogModel, AuditLog } from './AuditLog';
import { initNotificationModel, Notification } from './Notification';
import { initLeadModel, Lead } from './Lead';
import { initCampaignModel, Campaign } from './Campaign';
import { initFollowUpSequenceModel, FollowUpSequence } from './FollowUpSequence';
import { initCampaignLeadModel, CampaignLead } from './CampaignLead';
import { initScheduledEmailModel, ScheduledEmail } from './ScheduledEmail';
import { initCommunicationLogModel, CommunicationLog } from './CommunicationLog';
import { initInteractionOutcomeModel, InteractionOutcome } from './InteractionOutcome';
import { initUnsubscribeModel, Unsubscribe } from './Unsubscribe';
import { initDncListModel, DncList } from './DncList';
import { initAiAgentModel, AiAgent } from './AiAgent';
import { initCampaignHealthModel, CampaignHealth } from './CampaignHealth';
import { initCampaignErrorModel, CampaignError } from './CampaignError';
import { initCampaignVariantModel, CampaignVariant } from './CampaignVariant';
import { initCampaignInsightModel, CampaignInsight } from './CampaignInsight';
import { initIntelligenceDecisionModel, IntelligenceDecision } from './IntelligenceDecision';
import { initVisitorModel, Visitor } from './Visitor';
import { initVisitorSessionModel, VisitorSession } from './VisitorSession';
import { initPageEventModel, PageEvent } from './PageEvent';

export function initModels(sequelize: Sequelize) {
  initUserModel(sequelize);
  initSystemSettingModel(sequelize);
  initAuditLogModel(sequelize);
  initNotificationModel(sequelize);
  initLeadModel(sequelize);
  initCampaignModel(sequelize);
  initFollowUpSequenceModel(sequelize);
  initCampaignLeadModel(sequelize);
  initScheduledEmailModel(sequelize);
  initCommunicationLogModel(sequelize);
  initInteractionOutcomeModel(sequelize);
  initUnsubscribeModel(sequelize);
  initDncListModel(sequelize);
  initAiAgentModel(sequelize);
  initCampaignHealthModel(sequelize);
  initCampaignErrorModel(sequelize);
  initCampaignVariantModel(sequelize);
  initCampaignInsightModel(sequelize);
  initIntelligenceDecisionModel(sequelize);
  initVisitorModel(sequelize);
  initVisitorSessionModel(sequelize);
  initPageEventModel(sequelize);

  // Associations
  Campaign.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });
  CampaignLead.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
  CampaignLead.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
  ScheduledEmail.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
  ScheduledEmail.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
  CommunicationLog.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
  InteractionOutcome.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
}

export {
  User, SystemSetting, AuditLog, Notification, Lead,
  Campaign, FollowUpSequence, CampaignLead,
  ScheduledEmail, CommunicationLog, InteractionOutcome,
  Unsubscribe, DncList, AiAgent,
  CampaignHealth, CampaignError,
  CampaignVariant, CampaignInsight, IntelligenceDecision,
  Visitor, VisitorSession, PageEvent,
};
