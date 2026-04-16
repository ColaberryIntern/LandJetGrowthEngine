'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('agent_runs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      agent_name: { type: Sequelize.STRING(100), allowNull: false },
      status: { type: Sequelize.ENUM('success', 'failed', 'skipped'), allowNull: false, defaultValue: 'success' },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      details: { type: Sequelize.JSONB, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('agent_runs', ['agent_name', 'created_at'], { name: 'idx_agent_runs_name_created' });
    await queryInterface.addIndex('agent_runs', ['status'], { name: 'idx_agent_runs_status' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('agent_runs');
  },
};
