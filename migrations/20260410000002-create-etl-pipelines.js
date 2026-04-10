'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('etl_pipelines', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      source: { type: Sequelize.ENUM('user_interactions', 'api_metrics', 'survey_responses', 'campaign_data', 'visitor_data', 'custom'), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'extracting', 'transforming', 'loading', 'completed', 'failed'), allowNull: false, defaultValue: 'pending' },
      records_extracted: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      records_transformed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      records_loaded: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      duration_ms: { type: Sequelize.INTEGER, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      config: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('etl_pipelines', ['status']);
    await queryInterface.addIndex('etl_pipelines', ['source']);
    await queryInterface.addIndex('etl_pipelines', ['created_at']);
  },
  async down(queryInterface) { await queryInterface.dropTable('etl_pipelines'); },
};
