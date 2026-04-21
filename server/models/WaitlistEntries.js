module.exports = (sequelize, DataTypes) => {
    const WaitlistEntries = sequelize.define('WaitlistEntries', {
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: { isEmail: true },
        },
        role: {
            type: DataTypes.ENUM('student', 'alumni', 'other'),
            defaultValue: 'student',
        },
        curriculum: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    });

    return WaitlistEntries;
};
