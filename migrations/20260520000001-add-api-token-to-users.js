'use strict';

// Adds a long-lived API token column to users for the Chrome extension
// (and any future scripted clients). NULL = not provisioned for that user.
// UNIQUE so token lookup is O(log n) with the index.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'api_token', {
      type: Sequelize.STRING(128),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addIndex('users', ['api_token'], {
      name: 'users_api_token_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'users_api_token_idx');
    await queryInterface.removeColumn('users', 'api_token');
  },
};
