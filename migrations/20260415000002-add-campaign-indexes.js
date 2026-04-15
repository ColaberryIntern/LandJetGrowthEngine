'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Campaign: common query WHERE status = 'active' AND approval_status = 'live'
    await queryInterface.addIndex('campaigns', ['status', 'approval_status'], {
      name: 'idx_campaigns_status_approval',
      concurrently: true,
    }).catch(() => {});

    // Campaign: list sorted by created_at
    await queryInterface.addIndex('campaigns', ['created_at'], {
      name: 'idx_campaigns_created_at',
      concurrently: true,
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('campaigns', 'idx_campaigns_status_approval').catch(() => {});
    await queryInterface.removeIndex('campaigns', 'idx_campaigns_created_at').catch(() => {});
  },
};
