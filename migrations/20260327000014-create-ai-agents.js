'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_agents', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      type: { type: Sequelize.STRING(100), allowNull: false },
      department: { type: Sequelize.STRING(100), allowNull: true },
      status: { type: Sequelize.ENUM('active', 'paused', 'disabled', 'error'), allowNull: false, defaultValue: 'active' },
      config: { type: Sequelize.JSONB, allowNull: true },
      schedule: { type: Sequelize.STRING(100), allowNull: true },
      last_run_at: { type: Sequelize.DATE, allowNull: true },
      metrics: { type: Sequelize.JSONB, allowNull: true },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('ai_agents', ['type']);
    await queryInterface.addIndex('ai_agents', ['status']);
    await queryInterface.addIndex('ai_agents', ['enabled']);
  },
  async down(queryInterface) { await queryInterface.dropTable('ai_agents'); },
};
