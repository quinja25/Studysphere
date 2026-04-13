module.exports = (sequelize, DataTypes) => {
    const UserResources = sequelize.define("UserResources", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        resourceId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    }, {
        indexes: [
            { unique: true, fields: ['userId', 'resourceId'] }
        ]
    });

    UserResources.associate = (models) => {
        UserResources.belongsTo(models.Users,     { foreignKey: 'userId'     });
        UserResources.belongsTo(models.Resources, { foreignKey: 'resourceId' });
    };

    return UserResources;
};
