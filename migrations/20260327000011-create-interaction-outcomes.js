'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('interaction_outcomes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'leads', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      campaign_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      scheduled_email_id: { type: Sequelize.UUID, allowNull: true },
      channel: { type: Sequelize.STRING(10), allowNull: false },
      step_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      outcome: {
        type: Sequelize.ENUM(
          'sent', 'opened', 'clicked', 'replied', 'booked_meeting',
          'converted', 'no_response', 'bounced', 'unsubscribed',
          'voicemail', 'answered', 'declined',
        ),
        allowNull: false,
      },
      lead_industry: { type: Sequelize.STRING(100), allowNull: true },
      lead_title_category: { type: Sequelize.STRING(100), allowNull: true },
      lead_company_size_bucket: { type: Sequelize.STRING(50), allowNull: true },
      lead_source_type: { type: Sequelize.STRING(50), allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('interaction_outcomes', ['lead_id']);
    await queryInterface.addIndex('interaction_outcomes', ['campaign_id']);
    await queryInterface.addIndex('interaction_outcomes', ['outcome']);
    await queryInterface.addIndex('interaction_outcomes', ['channel']);
    await queryInterface.addIndex('interaction_outcomes', ['created_at']);
    await queryInterface.addIndex('interaction_outcomes', ['campaign_id', 'outcome']);
  },
  async down(queryInterface) { await queryInterface.dropTable('interaction_outcomes'); },
};
