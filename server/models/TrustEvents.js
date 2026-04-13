module.exports = (sequelize, DataTypes) => {
    const TrustEvents = sequelize.define("TrustEvents", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        reportedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        type: {
            type: DataTypes.ENUM('report', 'warning', 'ban', 'unban', 'trust_decrease', 'trust_increase'),
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        trustDelta: {
            type: DataTypes.FLOAT,
            defaultValue: 0,
        },
        newTrustScore: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
    });

    TrustEvents.associate = (models) => {
        TrustEvents.belongsTo(models.Users, { foreignKey: 'userId', as: 'user' });
        TrustEvents.belongsTo(models.Users, { foreignKey: 'reportedBy', as: 'reporter' });
    };

    return TrustEvents;
};
