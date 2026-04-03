'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_threads', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      gmail_message_id: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      gmail_thread_id: { type: Sequelize.STRING(255), allowNull: false },
      sender: { type: Sequelize.STRING(255), allowNull: false },
      recipients: { type: Sequelize.JSONB, allowNull: true },
      subject: { type: Sequelize.STRING(500), allowNull: true },
      body: { type: Sequelize.TEXT, allowNull: true },
      received_at: { type: Sequelize.DATE, allowNull: false },
      processed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      skipped: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      classified_data: { type: Sequelize.JSONB, allowNull: true },
      priority_score: { type: Sequelize.FLOAT, allowNull: true },
      raw_payload: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('email_threads', ['gmail_thread_id']);
    await queryInterface.addIndex('email_threads', ['sender']);
    await queryInterface.addIndex('email_threads', ['processed']);
    await queryInterface.addIndex('email_threads', ['received_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_threads');
  },
};
