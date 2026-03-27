'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scheduled_emails', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'leads', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      campaign_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      sequence_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'follow_up_sequences', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      step_index: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      channel: { type: Sequelize.ENUM('email', 'voice', 'sms'), allowNull: false },
      subject: { type: Sequelize.STRING(255), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: true },
      to_email: { type: Sequelize.STRING(255), allowNull: true },
      to_phone: { type: Sequelize.STRING(30), allowNull: true },
      voice_agent_type: { type: Sequelize.STRING(50), allowNull: true },
      max_attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      attempts_made: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      fallback_channel: { type: Sequelize.STRING(10), allowNull: true },
      scheduled_for: { type: Sequelize.DATE, allowNull: false },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'processing', 'sent', 'failed', 'cancelled', 'paused'), allowNull: false, defaultValue: 'pending' },
      processing_started_at: { type: Sequelize.DATE, allowNull: true },
      processor_id: { type: Sequelize.STRING(100), allowNull: true },
      ai_instructions: { type: Sequelize.TEXT, allowNull: true },
      ai_generated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_test_action: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('scheduled_emails', ['status', 'scheduled_for']);
    await queryInterface.addIndex('scheduled_emails', ['status', 'processing_started_at']);
    await queryInterface.addIndex('scheduled_emails', ['campaign_id', 'status']);
    await queryInterface.addIndex('scheduled_emails', ['lead_id']);
  },
  async down(queryInterface) { await queryInterface.dropTable('scheduled_emails'); },
};
