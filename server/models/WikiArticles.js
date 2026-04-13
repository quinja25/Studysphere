module.exports = (sequelize, DataTypes) => {
    const WikiArticles = sequelize.define("WikiArticles", {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        authorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        views: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        tags: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    });

    WikiArticles.associate = (models) => {
        WikiArticles.belongsTo(models.Users, { foreignKey: 'authorId', as: 'author' });
    };

    return WikiArticles;
};
