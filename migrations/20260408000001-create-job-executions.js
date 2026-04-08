'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('job_executions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      job_name: { type: Sequelize.STRING(255), allowNull: false },
      job_type: {
        type: Sequelize.ENUM('scheduler', 'agent', 'draft_engine', 'repair', 'health_scan'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('running', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'running',
      },
      started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      result: { type: Sequelize.JSONB, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('job_executions', ['job_name']);
    await queryInterface.addIndex('job_executions', ['status']);
    await queryInterface.addIndex('job_executions', ['started_at']);
    await queryInterface.addIndex('job_executions', ['job_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('job_executions');
  },
};
