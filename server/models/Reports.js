module.exports = (sequelize, DataTypes) => {
    const Reports = sequelize.define("Reports", {
        reporterId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        reportedUserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('spam', 'harassment', 'inappropriate', 'impersonation', 'other'),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pending', 'reviewed', 'dismissed', 'actioned'),
            defaultValue: 'pending',
        },
        reviewedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        reviewedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        action: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    });

    Reports.associate = (models) => {
        Reports.belongsTo(models.Users, { foreignKey: 'reporterId', as: 'reporter' });
        Reports.belongsTo(models.Users, { foreignKey: 'reportedUserId', as: 'reportedUser' });
        Reports.belongsTo(models.Users, { foreignKey: 'reviewedBy', as: 'reviewer' });
    };

    return Reports;
};
