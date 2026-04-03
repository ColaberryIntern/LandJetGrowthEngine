'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('contacts', 'priority_score', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addIndex('contacts', ['priority_score']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contacts', 'priority_score');
  },
};
