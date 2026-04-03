'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('topic_thread_maps', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      gmail_thread_id: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      basecamp_topic_id: { type: Sequelize.STRING(100), allowNull: true },
      basecamp_todolist_id: { type: Sequelize.STRING(100), allowNull: true },
      status: {
        type: Sequelize.ENUM('active', 'resolved', 'stalled'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_updated: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('topic_thread_maps', ['gmail_thread_id']);
    await queryInterface.addIndex('topic_thread_maps', ['basecamp_topic_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('topic_thread_maps');
  },
};
