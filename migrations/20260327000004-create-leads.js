'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leads', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      first_name: { type: Sequelize.STRING(100), allowNull: false },
      last_name: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      company: { type: Sequelize.STRING(255), allowNull: true },
      title: { type: Sequelize.STRING(255), allowNull: true },
      industry: { type: Sequelize.STRING(100), allowNull: true },
      company_size: { type: Sequelize.INTEGER, allowNull: true },
      annual_revenue: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      linkedin_url: { type: Sequelize.STRING(500), allowNull: true },
      lead_source: { type: Sequelize.STRING(100), allowNull: true },
      lead_source_type: { type: Sequelize.STRING(50), allowNull: true },
      temperature: {
        type: Sequelize.ENUM('cold', 'warm', 'hot'),
        allowNull: false,
        defaultValue: 'cold',
      },
      lead_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lifecycle_stage: { type: Sequelize.STRING(50), allowNull: true },
      pipeline_stage: {
        type: Sequelize.ENUM(
          'new_lead', 'contacted', 'meeting_scheduled',
          'proposal_sent', 'negotiation', 'enrolled', 'lost',
        ),
        allowNull: false,
        defaultValue: 'new_lead',
      },
      notes: { type: Sequelize.JSONB, allowNull: true },
      technology_stack: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      utm_source: { type: Sequelize.STRING(255), allowNull: true },
      interest_area: { type: Sequelize.STRING(255), allowNull: true },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'archived'),
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('leads', ['email']);
    await queryInterface.addIndex('leads', ['pipeline_stage']);
    await queryInterface.addIndex('leads', ['lead_score']);
    await queryInterface.addIndex('leads', ['temperature']);
    await queryInterface.addIndex('leads', ['status']);
    await queryInterface.addIndex('leads', ['industry']);
    await queryInterface.addIndex('leads', ['lead_source_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leads');
  },
};
