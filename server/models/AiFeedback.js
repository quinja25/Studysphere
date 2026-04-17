module.exports = (sequelize, DataTypes) => {
    const AiFeedback = sequelize.define("AiFeedback", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        messageId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        queryText: {
            type: DataTypes.STRING(1000),
            allowNull: false,
        },
        rating: {
            type: DataTypes.ENUM('up', 'down'),
            allowNull: false,
        },
        comment: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        clickedSources: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        indexes: [
            { fields: ['userId', 'createdAt'] },
            { fields: ['rating', 'createdAt'] },
        ],
    });

    AiFeedback.associate = (models) => {
        AiFeedback.belongsTo(models.Users, { foreignKey: 'userId', as: 'user' });
    };

    return AiFeedback;
};
