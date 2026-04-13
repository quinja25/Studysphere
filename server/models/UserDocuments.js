module.exports = (sequelize, DataTypes) => {
    const UserDocuments = sequelize.define("UserDocuments", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        docType: {
            type: DataTypes.ENUM('textbook', 'past_paper', 'notes', 'other'),
            defaultValue: 'other',
        },
        pageCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        chunkCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    });

    UserDocuments.associate = (models) => {
        UserDocuments.belongsTo(models.Users, { foreignKey: 'userId', as: 'owner' });
    };

    return UserDocuments;
};
