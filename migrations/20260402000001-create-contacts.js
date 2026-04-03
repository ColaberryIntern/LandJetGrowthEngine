'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contacts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: { type: Sequelize.STRING(255), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      company: { type: Sequelize.STRING(255), allowNull: true },
      relationship_type: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'PAST_CLIENT' },
      sequence_stage: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      last_contacted_at: { type: Sequelize.DATE, allowNull: true },
      next_action_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'ACTIVE' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('contacts', ['email'], { unique: true });
    await queryInterface.addIndex('contacts', ['status']);
    await queryInterface.addIndex('contacts', ['next_action_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contacts');
  },
};
