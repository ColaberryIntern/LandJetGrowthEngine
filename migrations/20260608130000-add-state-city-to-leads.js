'use strict';

// Adds state + city to leads so the admin filter bar and the per-user
// territory_default scope (added in 20260608120000-add-territory-default-to-users)
// can filter by geography.
//
// Apollo returns state as either a 2-letter abbreviation or a full name
// depending on the endpoint; we store whatever it gives us and match
// case-insensitively with ILIKE at read time. Normalization can come later
// if we need stricter equality.
//
// Existing leads stay NULL on both fields. NULL leads do not match
// tx_only or non_tx filters (they fall through to Ali's "all" scope).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leads', 'state', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    await queryInterface.addColumn('leads', 'city', {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
    await queryInterface.addIndex('leads', ['state'], { name: 'leads_state_idx' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('leads', 'leads_state_idx');
    await queryInterface.removeColumn('leads', 'city');
    await queryInterface.removeColumn('leads', 'state');
  },
};
