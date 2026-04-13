'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('Questions', 'tags', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
        await queryInterface.addColumn('WikiArticles', 'tags', {
            type: Sequelize.TEXT,
            allowNull: true,
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('Questions', 'tags');
        await queryInterface.removeColumn('WikiArticles', 'tags');
    },
};
