'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('communication_feedback', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      topic_thread_map_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'topic_thread_maps', key: 'id' },
        onDelete: 'CASCADE',
      },
      todos_created: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      todos_completed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_recurring: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      recurrence_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_activity: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('communication_feedback', ['topic_thread_map_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('communication_feedback');
  },
};
