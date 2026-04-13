module.exports = (sequelize, DataTypes) => {
    const StudySessions = sequelize.define("StudySessions", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        startedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        endedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        durationMinutes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        xpEarned: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    });

    StudySessions.associate = (models) => {
        StudySessions.belongsTo(models.Users, { foreignKey: 'userId' });
        StudySessions.belongsTo(models.Groups, { foreignKey: 'groupId' });
    };

    return StudySessions;
};
