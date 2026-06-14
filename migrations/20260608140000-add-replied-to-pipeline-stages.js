'use strict';

// Adds a `replied` value to the leads.pipeline_stage enum, slotted between
// `contacted` and `meeting_scheduled`. Postgres requires ALTER TYPE ... ADD
// VALUE for enum additions; the existing column type is `enum_leads_pipeline_stage`.
//
// No backfill happens here -- the backfill script is run separately so it
// can be re-run/dry-run without re-running the migration.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_leads_pipeline_stage" ADD VALUE IF NOT EXISTS 'replied' AFTER 'contacted';`,
    );
  },

  async down() {
    // Postgres does not support removing values from an enum without a full
    // type rebuild. Leaving down() as a no-op is the standard pattern for
    // ADD VALUE migrations; if a real rollback is ever needed, do a full
    // type-rebuild migration (CREATE TYPE x_new, UPDATE column, DROP old).
  },
};
