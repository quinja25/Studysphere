module.exports = (sequelize, DataTypes) => {
    const PostLikes = sequelize.define("PostLikes", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        postId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    }, {
        indexes: [
            { unique: true, fields: ['userId', 'postId'] }
        ]
    });

    PostLikes.associate = (models) => {
        PostLikes.belongsTo(models.Users, { foreignKey: 'userId' });
        PostLikes.belongsTo(models.Posts, { foreignKey: 'postId' });
    };

    return PostLikes;
};
