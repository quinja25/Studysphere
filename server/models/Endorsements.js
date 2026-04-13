module.exports = (sequelize, DataTypes) => {
    const Endorsements = sequelize.define("Endorsements", {
        studentId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        alumniId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        message: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    }, {
        indexes: [
            { unique: true, fields: ['studentId', 'alumniId'] }
        ]
    });

    Endorsements.associate = (models) => {
        Endorsements.belongsTo(models.Users, { foreignKey: 'studentId', as: 'student' });
        Endorsements.belongsTo(models.Users, { foreignKey: 'alumniId', as: 'alumni' });
    };

    return Endorsements;
};
