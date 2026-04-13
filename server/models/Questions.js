module.exports = (sequelize, DataTypes) => {
    const Questions = sequelize.define("Questions", {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        body: {
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
        isAnswered: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        tags: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    });

    Questions.associate = (models) => {
        Questions.belongsTo(models.Users, { foreignKey: 'authorId', as: 'author' });
        Questions.hasMany(models.Answers, { foreignKey: 'questionId', as: 'answers', onDelete: 'CASCADE' });
    };

    return Questions;
};
