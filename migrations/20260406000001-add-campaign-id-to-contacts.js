'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('contacts', 'campaign_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('contacts', ['campaign_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contacts', 'campaign_id');
  },
};
