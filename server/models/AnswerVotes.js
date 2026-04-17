module.exports = (sequelize, DataTypes) => {
    const AnswerVotes = sequelize.define("AnswerVotes", {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        answerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    }, {
        indexes: [
            { unique: true, fields: ['userId', 'answerId'] }
        ]
    });

    AnswerVotes.associate = (models) => {
        AnswerVotes.belongsTo(models.Users,   { foreignKey: 'userId'   });
        AnswerVotes.belongsTo(models.Answers, { foreignKey: 'answerId' });
    };

    return AnswerVotes;
};
