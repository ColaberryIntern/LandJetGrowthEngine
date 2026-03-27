'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Add 'draft' and 'approved' to scheduled_emails status enum
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_scheduled_emails_status\" ADD VALUE IF NOT EXISTS 'draft';"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_scheduled_emails_status\" ADD VALUE IF NOT EXISTS 'approved';"
    );

    // Partial indexes for fast draft/approved queries
    await queryInterface.sequelize.query(
      "CREATE INDEX IF NOT EXISTS idx_scheduled_emails_draft ON scheduled_emails (status) WHERE status = 'draft';"
    );
    await queryInterface.sequelize.query(
      "CREATE INDEX IF NOT EXISTS idx_scheduled_emails_approved ON scheduled_emails (status, scheduled_for) WHERE status = 'approved';"
    );
  },

  async down(queryInterface) {
    // Note: PostgreSQL does not support removing values from enums.
    // Drop the partial indexes only.
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_scheduled_emails_draft;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_scheduled_emails_approved;');
  },
};
