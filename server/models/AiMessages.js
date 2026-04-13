module.exports = (sequelize, DataTypes) => {
    const AiMessages = sequelize.define("AiMessages", {
        role: {
            type: DataTypes.ENUM('user', 'assistant'),
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        tokens: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        }
    }, {
        indexes: [
            { fields: ['groupId'] },
            { fields: ['userId'] },
        ],
    });

    AiMessages.associate = (models) => {
        AiMessages.belongsTo(models.Groups, {
            foreignKey: 'groupId',
            onDelete: 'CASCADE'
        });
        AiMessages.belongsTo(models.Users, {
            foreignKey: 'userId',
        });
    };

    return AiMessages;
};
