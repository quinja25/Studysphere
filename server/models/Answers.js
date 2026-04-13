module.exports = (sequelize, DataTypes) => {
    const Answers = sequelize.define("Answers", {
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        questionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        authorId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        isAccepted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        votes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
    });

    Answers.associate = (models) => {
        Answers.belongsTo(models.Questions, { foreignKey: 'questionId' });
        Answers.belongsTo(models.Users, { foreignKey: 'authorId', as: 'author' });
    };

    return Answers;
};
