'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaigns', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      type: {
        type: Sequelize.ENUM(
          'warm_nurture', 'cold_outbound', 're_engagement',
          'behavioral_trigger', 'alumni', 'alumni_re_engagement',
          'payment_readiness', 'executive_outreach',
        ),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('draft', 'active', 'paused', 'completed'),
        allowNull: false, defaultValue: 'draft',
      },
      campaign_mode: {
        type: Sequelize.ENUM('standard', 'autonomous'),
        allowNull: false, defaultValue: 'standard',
      },
      sequence_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'follow_up_sequences', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      targeting_criteria: { type: Sequelize.JSONB, allowNull: true },
      channel_config: { type: Sequelize.JSONB, allowNull: true },
      ai_system_prompt: { type: Sequelize.TEXT, allowNull: true },
      settings: { type: Sequelize.JSONB, allowNull: true },
      budget_total: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      budget_spent: { type: Sequelize.DECIMAL(12, 2), allowNull: true, defaultValue: 0 },
      budget_cap: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      cost_per_lead_target: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      expected_roi: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      goals: { type: Sequelize.TEXT, allowNull: true },
      gtm_notes: { type: Sequelize.TEXT, allowNull: true },
      interest_group: { type: Sequelize.STRING(255), allowNull: true },
      qa_status: {
        type: Sequelize.ENUM('untested', 'passed', 'failed'),
        allowNull: false, defaultValue: 'untested',
      },
      ramp_state: { type: Sequelize.JSONB, allowNull: true },
      evolution_config: { type: Sequelize.JSONB, allowNull: true },
      approval_status: {
        type: Sequelize.ENUM('draft', 'pending_approval', 'approved', 'live', 'paused', 'completed'),
        allowNull: false, defaultValue: 'draft',
      },
      approved_by: { type: Sequelize.UUID, allowNull: true },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('campaigns', ['status']);
    await queryInterface.addIndex('campaigns', ['type']);
    await queryInterface.addIndex('campaigns', ['approval_status']);
    await queryInterface.addIndex('campaigns', ['sequence_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaigns');
  },
};
