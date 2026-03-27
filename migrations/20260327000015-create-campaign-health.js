'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('campaign_health', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      campaign_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'campaigns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      health_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      status: { type: Sequelize.ENUM('healthy', 'degraded', 'critical', 'unknown'), allowNull: false, defaultValue: 'unknown' },
      lead_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      active_lead_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      sent_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      error_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      components: { type: Sequelize.JSONB, allowNull: true },
      metrics: { type: Sequelize.JSONB, allowNull: true },
      last_scan_at: { type: Sequelize.DATE, allowNull: true },
    });
  },
  async down(queryInterface) { await queryInterface.dropTable('campaign_health'); },
};
