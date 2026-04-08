'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('acquisition_strategies', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      channel: { type: Sequelize.ENUM('email_outreach', 'linkedin', 'referral', 'content_marketing', 'paid_ads', 'events', 'partnerships', 'other'), allowNull: false },
      status: { type: Sequelize.ENUM('draft', 'active', 'paused', 'completed'), allowNull: false, defaultValue: 'draft' },
      target_audience: { type: Sequelize.TEXT, allowNull: true },
      goals: { type: Sequelize.TEXT, allowNull: true },
      budget: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      budget_spent: { type: Sequelize.DECIMAL(12, 2), allowNull: true, defaultValue: 0 },
      leads_generated: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      conversions: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      conversion_rate: { type: Sequelize.FLOAT, allowNull: true },
      owner_id: { type: Sequelize.UUID, allowNull: true },
      start_date: { type: Sequelize.DATE, allowNull: true },
      end_date: { type: Sequelize.DATE, allowNull: true },
      metrics: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('acquisition_strategies', ['status']);
    await queryInterface.addIndex('acquisition_strategies', ['channel']);
  },
  async down(queryInterface) { await queryInterface.dropTable('acquisition_strategies'); },
};
