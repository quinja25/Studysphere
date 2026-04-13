module.exports = (sequelize, DataTypes) => {
    const IbSubjects = sequelize.define('IbSubjects', {
        subjectCode: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true,
        },
        groupNumber: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        groupName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        subjectName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        hasSL: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        hasHL: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    });
    return IbSubjects;
};
