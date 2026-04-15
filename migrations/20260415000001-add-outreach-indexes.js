'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Lead: getLeadsForToday() - campaign_id + outreach_status + status + next_action_at
    await queryInterface.addIndex('leads', ['campaign_id', 'outreach_status', 'status', 'next_action_at'], {
      name: 'idx_leads_outreach_queue',
      concurrently: true,
    }).catch(() => {});

    // Lead: campaign_id + status (general campaign filtering)
    await queryInterface.addIndex('leads', ['campaign_id', 'status'], {
      name: 'idx_leads_campaign_status',
      concurrently: true,
    }).catch(() => {});

    // InteractionOutcome: getDashboardKPIs (outcome + created_at range)
    await queryInterface.addIndex('interaction_outcomes', ['outcome', 'created_at'], {
      name: 'idx_outcomes_outcome_created',
      concurrently: true,
    }).catch(() => {});

    // InteractionOutcome: getHotLeads (lead_id + outcome aggregation)
    await queryInterface.addIndex('interaction_outcomes', ['lead_id', 'outcome'], {
      name: 'idx_outcomes_lead_outcome',
      concurrently: true,
    }).catch(() => {});

    // CommunicationLog: bounce detection in QA/repair agents
    await queryInterface.addIndex('communication_logs', ['status', 'created_at'], {
      name: 'idx_commlogs_status_created',
      concurrently: true,
    }).catch(() => {});

    // CampaignLead: sequence engine due leads query
    await queryInterface.addIndex('campaign_leads', ['campaign_id', 'status', 'next_action_at'], {
      name: 'idx_campaign_leads_due',
      concurrently: true,
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('leads', 'idx_leads_outreach_queue').catch(() => {});
    await queryInterface.removeIndex('leads', 'idx_leads_campaign_status').catch(() => {});
    await queryInterface.removeIndex('interaction_outcomes', 'idx_outcomes_outcome_created').catch(() => {});
    await queryInterface.removeIndex('interaction_outcomes', 'idx_outcomes_lead_outcome').catch(() => {});
    await queryInterface.removeIndex('communication_logs', 'idx_commlogs_status_created').catch(() => {});
    await queryInterface.removeIndex('campaign_leads', 'idx_campaign_leads_due').catch(() => {});
  },
};
