'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaign_errors', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      campaign_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      component: { type: Sequelize.STRING(50), allowNull: false },
      severity: { type: Sequelize.ENUM('info', 'warning', 'error', 'critical'), allowNull: false },
      error_message: { type: Sequelize.TEXT, allowNull: false },
      context: { type: Sequelize.JSONB, allowNull: true },
      resolved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      resolved_by: { type: Sequelize.UUID, allowNull: true },
      stack_trace: { type: Sequelize.TEXT, allowNull: true },
      ai_reasoning: { type: Sequelize.TEXT, allowNull: true },
      repair_attempt_id: { type: Sequelize.UUID, allowNull: true },
      retry_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_retry_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('campaign_errors', ['campaign_id']);
    await queryInterface.addIndex('campaign_errors', ['severity']);
    await queryInterface.addIndex('campaign_errors', ['resolved']);
  },
  async down(queryInterface) { await queryInterface.dropTable('campaign_errors'); },
};
