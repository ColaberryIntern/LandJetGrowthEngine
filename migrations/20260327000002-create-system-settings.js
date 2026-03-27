'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_settings', {
      key: {
        type: Sequelize.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('system_settings');
  },
};
