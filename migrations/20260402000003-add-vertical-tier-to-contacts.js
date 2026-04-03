'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('contacts', 'vertical', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('contacts', 'tier', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex('contacts', ['vertical']);
    await queryInterface.addIndex('contacts', ['tier']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contacts', 'tier');
    await queryInterface.removeColumn('contacts', 'vertical');
  },
};
