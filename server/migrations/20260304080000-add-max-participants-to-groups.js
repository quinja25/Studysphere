'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Groups', 'maxParticipants', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 10
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Groups', 'maxParticipants');
  }
};
