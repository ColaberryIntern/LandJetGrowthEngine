'use strict';

// Adds per-user territory scope so the admin UI can default queues to the
// right view (Percy -> tx_only, Ryan -> non_tx, Ali -> all). Also adds a
// generic default_filters JSONB for future filter persistence (state list,
// city list, comm_type, etc).
//
// Existing users default to 'all' (no behavior change for current accounts).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'territory_default', {
      type: Sequelize.ENUM('tx_only', 'non_tx', 'all'),
      allowNull: false,
      defaultValue: 'all',
    });
    await queryInterface.addColumn('users', 'default_filters', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'default_filters');
    await queryInterface.removeColumn('users', 'territory_default');
    // drop the enum type left behind by Postgres
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_territory_default";');
  },
};
