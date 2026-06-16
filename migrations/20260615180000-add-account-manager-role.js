'use strict';

// Adds 'account_manager' to the users.role enum. Per the 2026-06-14 phone call
// with Ryan: he wants to create territory owner accounts himself going forward,
// after Ali sets up the first two (Percy = TX, Iowa owner = IA). Rather than
// promoting Ryan to admin (he'd gain engine-level powers), we give him a
// scoped role that can only manage manager/user accounts, never admins.
//
// Capabilities (enforced in src/services/userManagementService.ts):
//   - List users, get user detail
//   - Create users with role=manager or role=user
//   - Change role/status/states on manager and user accounts
//   - Cannot: create admins, create account_managers, change Ali (or any admin)

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'account_manager';`,
    );
  },

  async down() {
    // Postgres does not support removing enum values without a full type rebuild.
    // No-op down() is the standard ADD VALUE pattern; the value can be left
    // orphaned with zero cost.
  },
};
