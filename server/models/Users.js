module.exports = (sequelize, DataTypes) => {
    const Users = sequelize.define("Users", {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true, // Important: Allow null for Google Login users
        },
        university: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        major: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        gradeLevel: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        role: {
            type: DataTypes.ENUM('student', 'alumni'),
            allowNull: false,
            defaultValue: 'student'
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        xp: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        level: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        curriculum: {
            type: DataTypes.STRING,
            allowNull: true
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true
        },
        targetUniversity: {
            type: DataTypes.STRING,
            allowNull: true
        },
        openHours: {
            type: DataTypes.STRING,
            allowNull: true
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        picture: {
            type: DataTypes.STRING,
            allowNull: true
        },
        aiCreditsUsed: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        aiCreditsResetAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Streak fields
        currentStreak: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        longestStreak: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        lastStudyDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        weeklyGoalMinutes: {
            type: DataTypes.INTEGER,
            defaultValue: 120,
        },
        weeklyStudiedMinutes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        weeklyGoalResetAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        totalStudyMinutes: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        totalSessions: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        // Admin/Trust fields
        trustScore: {
            type: DataTypes.FLOAT,
            defaultValue: 100.0,
        },
        isAdmin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        isShadowBanned: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        bannedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        banReason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Billing / Pro subscription
        isPro: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        proExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        stripeCustomerId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        bio: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        linkedinUrl: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        githubUrl: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        website: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    });
    Users.associate = (models) => {
        Users.belongsToMany(models.Groups, { through: models.UserGroup });
    };
    return Users;
}