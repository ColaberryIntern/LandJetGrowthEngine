'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('security_incidents', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(500), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      incident_type: { type: Sequelize.ENUM('unauthorized_access', 'data_breach', 'service_outage', 'rate_limit_abuse', 'suspicious_activity', 'configuration_error', 'other'), allowNull: false },
      severity: { type: Sequelize.ENUM('low', 'medium', 'high', 'critical'), allowNull: false, defaultValue: 'medium' },
      status: { type: Sequelize.ENUM('open', 'investigating', 'mitigated', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
      reported_by: { type: Sequelize.UUID, allowNull: true },
      assigned_to: { type: Sequelize.UUID, allowNull: true },
      resolution: { type: Sequelize.TEXT, allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('security_incidents', ['status']);
    await queryInterface.addIndex('security_incidents', ['severity']);
    await queryInterface.addIndex('security_incidents', ['incident_type']);
  },
  async down(queryInterface) { await queryInterface.dropTable('security_incidents'); },
};
