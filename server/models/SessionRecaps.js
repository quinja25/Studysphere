module.exports = (sequelize, DataTypes) => {
    const SessionRecaps = sequelize.define("SessionRecaps", {
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        generatedBy: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        summary: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        topicsCovered: {
            type: DataTypes.JSON,
            defaultValue: [],
        },
        linksShared: {
            type: DataTypes.JSON,
            defaultValue: [],
        },
        actionItems: {
            type: DataTypes.JSON,
            defaultValue: [],
        },
        participantIds: {
            type: DataTypes.JSON,
            defaultValue: [],
        },
        durationMinutes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        startedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        endedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    });

    SessionRecaps.associate = (models) => {
        SessionRecaps.belongsTo(models.Groups, { foreignKey: 'groupId', as: 'group' });
        SessionRecaps.belongsTo(models.Users, { foreignKey: 'generatedBy', as: 'generatedByUser' });
    };

    return SessionRecaps;
};
