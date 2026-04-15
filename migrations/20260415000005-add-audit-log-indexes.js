'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Audit log: stats query (action + created_at for today's top actions)
    await queryInterface.addIndex('audit_logs', ['action', 'created_at'], {
      name: 'idx_audit_logs_action_created',
      concurrently: true,
    }).catch(() => {});

    // Audit log: entity type stats + date range filtering
    await queryInterface.addIndex('audit_logs', ['entity_type', 'created_at'], {
      name: 'idx_audit_logs_entity_created',
      concurrently: true,
    }).catch(() => {});

    // Audit log: user + date range queries
    await queryInterface.addIndex('audit_logs', ['user_id', 'created_at'], {
      name: 'idx_audit_logs_user_created',
      concurrently: true,
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_action_created').catch(() => {});
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_entity_created').catch(() => {});
    await queryInterface.removeIndex('audit_logs', 'idx_audit_logs_user_created').catch(() => {});
  },
};
