'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('uncategorized_requirements', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(500), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      source: { type: Sequelize.STRING(100), allowNull: true },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium',
      },
      status: {
        type: Sequelize.ENUM('unreviewed', 'in_review', 'categorized', 'deferred', 'rejected'),
        allowNull: false,
        defaultValue: 'unreviewed',
      },
      assigned_capability: { type: Sequelize.STRING(255), allowNull: true },
      tags: { type: Sequelize.ARRAY(Sequelize.TEXT), allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      reviewed_by: { type: Sequelize.UUID, allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('uncategorized_requirements', ['status']);
    await queryInterface.addIndex('uncategorized_requirements', ['priority']);
    await queryInterface.addIndex('uncategorized_requirements', ['assigned_capability']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('uncategorized_requirements');
  },
};
