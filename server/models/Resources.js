module.exports = (sequelize, DataTypes) => {
    const Resources = sequelize.define("Resources", {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        price: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        authorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('essay', 'guide', 'template', 'notes', 'other'),
            allowNull: false,
            defaultValue: 'other',
        },
        downloads: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    });

    Resources.associate = (models) => {
        Resources.belongsTo(models.Users, { foreignKey: 'authorId', as: 'author' });
        Resources.hasMany(models.UserResources, { foreignKey: 'resourceId' });
    };

    return Resources;
};
