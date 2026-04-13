'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.renameColumn('Chats', 'name', 'author');
    await queryInterface.renameColumn('Chats', 'text', 'message');
    await queryInterface.addColumn('Chats', 'time', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Chats', 'isPinned', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Chats', 'isPinned');
    await queryInterface.removeColumn('Chats', 'time');
    await queryInterface.renameColumn('Chats', 'message', 'text');
    await queryInterface.renameColumn('Chats', 'author', 'name');
  }
};
