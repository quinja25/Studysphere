'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDesc = await queryInterface.describeTable('Users');

        if (!tableDesc.aiCreditsUsed) {
            await queryInterface.addColumn('Users', 'aiCreditsUsed', {
                type: Sequelize.INTEGER,
                defaultValue: 0,
            });
        }
        if (!tableDesc.aiCreditsResetAt) {
            await queryInterface.addColumn('Users', 'aiCreditsResetAt', {
                type: Sequelize.DATE,
                allowNull: true,
            });
        }
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('Users', 'aiCreditsUsed');
        await queryInterface.removeColumn('Users', 'aiCreditsResetAt');
    }
};
