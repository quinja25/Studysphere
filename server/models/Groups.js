module.exports = (sequelize, DataTypes) => {
    const Groups = sequelize.define("Groups", {
        groupName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        major: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        gradeLevel: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        leader: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        isPublic: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        password: {
            type: DataTypes.STRING,
            allowNull: true
        },
        maxParticipants: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10
        },
        // public: {
        //     type: DataTypes.BOOLEAN,
        //     allowNull: false
        // },
        // notificationSetting: {
        //     type: DataTypes.ENUM('Week', 'Day', 'Hour'),
        //     defaultValue: 'Day'
        // }
    });

    Groups.associate = (models) => {
        Groups.hasMany(models.Chats, {
            onDelete: 'cascade',
        });
        Groups.belongsToMany(models.Users, { through: models.UserGroup });
    };

    return Groups;
};