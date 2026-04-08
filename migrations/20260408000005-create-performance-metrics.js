'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('performance_metrics', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      category: { type: Sequelize.ENUM('api_latency', 'db_query', 'ai_generation', 'email_delivery', 'scheduler_cycle', 'memory_usage', 'throughput'), allowNull: false },
      metric_name: { type: Sequelize.STRING(255), allowNull: false },
      value: { type: Sequelize.FLOAT, allowNull: false },
      unit: { type: Sequelize.STRING(50), allowNull: false },
      threshold_warning: { type: Sequelize.FLOAT, allowNull: true },
      threshold_critical: { type: Sequelize.FLOAT, allowNull: true },
      status: { type: Sequelize.ENUM('normal', 'warning', 'critical'), allowNull: false, defaultValue: 'normal' },
      context: { type: Sequelize.JSONB, allowNull: true },
      recorded_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('performance_metrics', ['category']);
    await queryInterface.addIndex('performance_metrics', ['status']);
    await queryInterface.addIndex('performance_metrics', ['recorded_at']);
    await queryInterface.addIndex('performance_metrics', ['metric_name']);
  },
  async down(queryInterface) { await queryInterface.dropTable('performance_metrics'); },
};
