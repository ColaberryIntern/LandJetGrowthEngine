'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Add new job type enum values
    await queryInterface.sequelize.query(`ALTER TYPE "enum_job_executions_job_type" ADD VALUE IF NOT EXISTS 'data_enrichment'`);
    await queryInterface.sequelize.query(`ALTER TYPE "enum_job_executions_job_type" ADD VALUE IF NOT EXISTS 'email_dispatch'`);
  },

  async down() {
    // PostgreSQL does not support removing enum values; this is a no-op
  },
};
