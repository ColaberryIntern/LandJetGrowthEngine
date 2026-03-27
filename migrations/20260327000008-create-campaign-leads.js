'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaign_leads', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      campaign_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'campaigns', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      lead_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'leads', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('enrolled', 'active', 'paused', 'completed', 'removed'),
        allowNull: false, defaultValue: 'enrolled',
      },
      lifecycle_status: {
        type: Sequelize.ENUM('active', 'inactive', 're_engaging', 'enrolled', 'dnd', 'bounced'),
        allowNull: false, defaultValue: 'active',
      },
      enrolled_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      outcome: { type: Sequelize.STRING(100), allowNull: true },
      current_step_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      total_steps: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_activity_at: { type: Sequelize.DATE, allowNull: true },
      next_action_at: { type: Sequelize.DATE, allowNull: true },
      touchpoint_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      response_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      campaign_cycle_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      last_campaign_entry: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
    });

    await queryInterface.addIndex('campaign_leads', ['campaign_id', 'lead_id'], { unique: true });
    await queryInterface.addIndex('campaign_leads', ['campaign_id', 'status']);
    await queryInterface.addIndex('campaign_leads', ['lead_id']);
    await queryInterface.addIndex('campaign_leads', ['next_action_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('campaign_leads');
  },
};
