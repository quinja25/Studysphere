module.exports = (sequelize, DataTypes) => {
    const Posts = sequelize.define("Posts", {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('blog', 'advice'),
            allowNull: false,
            defaultValue: 'blog',
        },
        authorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        likes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    });

    Posts.associate = (models) => {
        Posts.belongsTo(models.Users, { foreignKey: 'authorId', as: 'author' });
    };

    return Posts;
};
