module.exports = (sequelize, DataTypes) => {
    const Notifications = sequelize.define("Notifications", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('answer', 'endorsement', 'report_actioned'),
            allowNull: false,
        },
        relatedType: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        relatedId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        content: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        link: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        isRead: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        indexes: [
            { fields: ['userId', 'isRead'] },
            { fields: ['userId', 'createdAt'] },
        ],
    });

    Notifications.associate = (models) => {
        Notifications.belongsTo(models.Users, { foreignKey: 'userId', as: 'recipient' });
    };

    return Notifications;
};
