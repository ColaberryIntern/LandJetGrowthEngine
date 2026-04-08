'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Outreach fields
    await queryInterface.addColumn('leads', 'vertical', { type: Sequelize.STRING(100), allowNull: true });
    await queryInterface.addColumn('leads', 'tier', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('leads', 'sequence_stage', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    await queryInterface.addColumn('leads', 'last_contacted_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('leads', 'next_action_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('leads', 'priority_score', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('leads', 'outreach_status', { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'ACTIVE' });
    await queryInterface.addColumn('leads', 'campaign_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('leads', ['vertical']);
    await queryInterface.addIndex('leads', ['tier']);
    await queryInterface.addIndex('leads', ['next_action_at']);
    await queryInterface.addIndex('leads', ['outreach_status']);
    await queryInterface.addIndex('leads', ['campaign_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leads', 'campaign_id');
    await queryInterface.removeColumn('leads', 'outreach_status');
    await queryInterface.removeColumn('leads', 'priority_score');
    await queryInterface.removeColumn('leads', 'next_action_at');
    await queryInterface.removeColumn('leads', 'last_contacted_at');
    await queryInterface.removeColumn('leads', 'sequence_stage');
    await queryInterface.removeColumn('leads', 'tier');
    await queryInterface.removeColumn('leads', 'vertical');
  },
};
