'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_feedback', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: true },
      type: { type: Sequelize.ENUM('bug', 'feature_request', 'usability', 'general', 'accessibility', 'privacy'), allowNull: false },
      status: { type: Sequelize.ENUM('submitted', 'reviewed', 'in_progress', 'resolved', 'declined'), allowNull: false, defaultValue: 'submitted' },
      subject: { type: Sequelize.STRING(500), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      rating: { type: Sequelize.INTEGER, allowNull: true },
      page_context: { type: Sequelize.STRING(255), allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      response: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('user_feedback', ['type']);
    await queryInterface.addIndex('user_feedback', ['status']);
    await queryInterface.addIndex('user_feedback', ['user_id']);

    await queryInterface.createTable('user_consents', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: false },
      consent_type: { type: Sequelize.ENUM('data_processing', 'marketing_emails', 'analytics_tracking', 'third_party_sharing'), allowNull: false },
      granted: { type: Sequelize.BOOLEAN, allowNull: false },
      granted_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('user_consents', ['user_id']);
    await queryInterface.addIndex('user_consents', ['consent_type']);
    await queryInterface.addIndex('user_consents', ['user_id', 'consent_type'], { unique: true });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('user_consents');
    await queryInterface.dropTable('user_feedback');
  },
};
