module.exports = (sequelize, DataTypes) => {
    const Chats = sequelize.define("Chats", {
        author: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        message: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        time: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        isPinned: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        }
    }, {
        indexes: [
            { fields: ['GroupId'] },
        ],
    })


    Chats.associate = (models) => {
        // Associate Chats with Groups
        Chats.belongsTo(models.Groups, {
            foreignKey: 'GroupId', // This will create a GroupId column in Chats table
            onDelete: 'CASCADE'
        });
    };


    return Chats;
}