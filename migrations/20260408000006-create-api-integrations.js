'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('api_integrations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      provider: { type: Sequelize.ENUM('openai', 'mandrill', 'synthflow', 'ghl', 'apollo', 'stripe', 'openclaw', 'custom'), allowNull: false },
      status: { type: Sequelize.ENUM('active', 'degraded', 'offline', 'pending'), allowNull: false, defaultValue: 'pending' },
      base_url: { type: Sequelize.STRING(500), allowNull: true },
      api_version: { type: Sequelize.STRING(20), allowNull: true },
      auth_type: { type: Sequelize.STRING(50), allowNull: true },
      rate_limit: { type: Sequelize.INTEGER, allowNull: true },
      last_health_check: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.TEXT, allowNull: true },
      total_calls: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      error_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      avg_latency_ms: { type: Sequelize.FLOAT, allowNull: true },
      config: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('api_integrations', ['provider']);
    await queryInterface.addIndex('api_integrations', ['status']);
  },
  async down(queryInterface) { await queryInterface.dropTable('api_integrations'); },
};
