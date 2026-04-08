'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('deployments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      version: { type: Sequelize.STRING(50), allowNull: false },
      environment: { type: Sequelize.ENUM('development', 'staging', 'production'), allowNull: false },
      status: { type: Sequelize.ENUM('planned', 'in_progress', 'deployed', 'rolled_back', 'failed'), allowNull: false, defaultValue: 'planned' },
      description: { type: Sequelize.TEXT, allowNull: true },
      changes: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      deployed_by: { type: Sequelize.UUID, allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      rollback_reason: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('deployments', ['status']);
    await queryInterface.addIndex('deployments', ['environment']);
    await queryInterface.addIndex('deployments', ['version']);
  },
  async down(queryInterface) { await queryInterface.dropTable('deployments'); },
};
