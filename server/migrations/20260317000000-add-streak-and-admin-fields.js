'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // Streak fields on Users
        await queryInterface.addColumn('Users', 'currentStreak', {
            type: Sequelize.INTEGER, defaultValue: 0, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'longestStreak', {
            type: Sequelize.INTEGER, defaultValue: 0, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'lastStudyDate', {
            type: Sequelize.DATEONLY, allowNull: true,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'weeklyGoalMinutes', {
            type: Sequelize.INTEGER, defaultValue: 120, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'weeklyStudiedMinutes', {
            type: Sequelize.INTEGER, defaultValue: 0, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'weeklyGoalResetAt', {
            type: Sequelize.DATE, allowNull: true,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'totalStudyMinutes', {
            type: Sequelize.INTEGER, defaultValue: 0, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'totalSessions', {
            type: Sequelize.INTEGER, defaultValue: 0, allowNull: false,
        }).catch(() => {});

        // Admin/Trust fields on Users
        await queryInterface.addColumn('Users', 'trustScore', {
            type: Sequelize.FLOAT, defaultValue: 100.0, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'isAdmin', {
            type: Sequelize.BOOLEAN, defaultValue: false, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'isShadowBanned', {
            type: Sequelize.BOOLEAN, defaultValue: false, allowNull: false,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'bannedAt', {
            type: Sequelize.DATE, allowNull: true,
        }).catch(() => {});
        await queryInterface.addColumn('Users', 'banReason', {
            type: Sequelize.STRING, allowNull: true,
        }).catch(() => {});

        // StudySessions table
        await queryInterface.createTable('StudySessions', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            userId: { type: Sequelize.INTEGER, allowNull: false },
            groupId: { type: Sequelize.INTEGER, allowNull: false },
            startedAt: { type: Sequelize.DATE, allowNull: false },
            endedAt: { type: Sequelize.DATE, allowNull: false },
            durationMinutes: { type: Sequelize.INTEGER, defaultValue: 0 },
            xpEarned: { type: Sequelize.INTEGER, defaultValue: 0 },
            createdAt: { type: Sequelize.DATE, allowNull: false },
            updatedAt: { type: Sequelize.DATE, allowNull: false },
        }).catch(() => {});

        // TrustEvents table
        await queryInterface.createTable('TrustEvents', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            userId: { type: Sequelize.INTEGER, allowNull: false },
            reportedBy: { type: Sequelize.INTEGER, allowNull: true },
            type: { type: Sequelize.ENUM('report', 'warning', 'ban', 'unban', 'trust_decrease', 'trust_increase'), allowNull: false },
            reason: { type: Sequelize.STRING, allowNull: false },
            trustDelta: { type: Sequelize.FLOAT, defaultValue: 0 },
            newTrustScore: { type: Sequelize.FLOAT, allowNull: false },
            createdAt: { type: Sequelize.DATE, allowNull: false },
            updatedAt: { type: Sequelize.DATE, allowNull: false },
        }).catch(() => {});

        // Reports table
        await queryInterface.createTable('Reports', {
            id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            reporterId: { type: Sequelize.INTEGER, allowNull: false },
            reportedUserId: { type: Sequelize.INTEGER, allowNull: false },
            type: { type: Sequelize.ENUM('spam', 'harassment', 'inappropriate', 'impersonation', 'other'), allowNull: false },
            description: { type: Sequelize.TEXT, allowNull: true },
            status: { type: Sequelize.ENUM('pending', 'reviewed', 'dismissed', 'actioned'), defaultValue: 'pending' },
            reviewedBy: { type: Sequelize.INTEGER, allowNull: true },
            reviewedAt: { type: Sequelize.DATE, allowNull: true },
            action: { type: Sequelize.STRING, allowNull: true },
            createdAt: { type: Sequelize.DATE, allowNull: false },
            updatedAt: { type: Sequelize.DATE, allowNull: false },
        }).catch(() => {});
    },

    async down(queryInterface) {
        const cols = ['currentStreak', 'longestStreak', 'lastStudyDate', 'weeklyGoalMinutes',
            'weeklyStudiedMinutes', 'weeklyGoalResetAt', 'totalStudyMinutes', 'totalSessions',
            'trustScore', 'isAdmin', 'isShadowBanned', 'bannedAt', 'banReason'];
        for (const col of cols) {
            await queryInterface.removeColumn('Users', col).catch(() => {});
        }
        await queryInterface.dropTable('StudySessions').catch(() => {});
        await queryInterface.dropTable('TrustEvents').catch(() => {});
        await queryInterface.dropTable('Reports').catch(() => {});
    },
};
