'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Users');

    if (!tableInfo.username) {
      await queryInterface.addColumn('Users', 'username', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      });
    }

    if (!tableInfo.major) {
      await queryInterface.addColumn('Users', 'major', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.openHours) {
      await queryInterface.addColumn('Users', 'openHours', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.isPublic) {
      await queryInterface.addColumn('Users', 'isPublic', {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // We check before removing to avoid errors if they didn't exist
    const tableInfo = await queryInterface.describeTable('Users');

    if (tableInfo.isPublic) await queryInterface.removeColumn('Users', 'isPublic');
    if (tableInfo.openHours) await queryInterface.removeColumn('Users', 'openHours');
    if (tableInfo.major) await queryInterface.removeColumn('Users', 'major');
    if (tableInfo.username) await queryInterface.removeColumn('Users', 'username');
  }
};