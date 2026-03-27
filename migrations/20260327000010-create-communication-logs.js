'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('communication_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      lead_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'leads', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      campaign_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      channel: { type: Sequelize.ENUM('email', 'sms', 'voice'), allowNull: false },
      direction: { type: Sequelize.ENUM('outbound', 'inbound'), allowNull: false, defaultValue: 'outbound' },
      delivery_mode: { type: Sequelize.ENUM('live', 'simulated', 'test'), allowNull: false, defaultValue: 'live' },
      status: { type: Sequelize.ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'), allowNull: false },
      to_address: { type: Sequelize.STRING(255), allowNull: true },
      from_address: { type: Sequelize.STRING(255), allowNull: true },
      subject: { type: Sequelize.STRING(255), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: true },
      provider: { type: Sequelize.STRING(50), allowNull: true },
      provider_message_id: { type: Sequelize.STRING(255), allowNull: true },
      provider_response: { type: Sequelize.JSONB, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('communication_logs', ['lead_id']);
    await queryInterface.addIndex('communication_logs', ['campaign_id']);
    await queryInterface.addIndex('communication_logs', ['channel']);
    await queryInterface.addIndex('communication_logs', ['status']);
    await queryInterface.addIndex('communication_logs', ['created_at']);
  },
  async down(queryInterface) { await queryInterface.dropTable('communication_logs'); },
};
