module.exports = (sequelize, DataTypes) => {
    const SessionGoals = sequelize.define("SessionGoals", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        groupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        goal: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        isCompleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        carriedForward: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    });

    SessionGoals.associate = (models) => {
        SessionGoals.belongsTo(models.Users, { foreignKey: 'userId', as: 'user' });
        SessionGoals.belongsTo(models.Groups, { foreignKey: 'groupId', as: 'group' });
    };

    return SessionGoals;
};