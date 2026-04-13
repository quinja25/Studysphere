module.exports = (sequelize, DataTypes) => {
    const GlobalDocuments = sequelize.define("GlobalDocuments", {
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        filename: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        curriculum: {
            type: DataTypes.ENUM('IB', 'A-Level', 'AP', 'GCSE', 'University', 'General'),
            defaultValue: 'General',
        },
        docType: {
            type: DataTypes.ENUM('textbook', 'past_paper', 'notes', 'other'),
            defaultValue: 'other',
        },
        uploadedBy: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        pageCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        chunkCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        fileSize: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        // Pre-computed chunks stored as JSON so reindexAll never needs the original file
        chunksJson: {
            type: DataTypes.TEXT('long'),
            allowNull: true,
        },
    });

    GlobalDocuments.associate = (models) => {
        GlobalDocuments.belongsTo(models.Users, { foreignKey: 'uploadedBy', as: 'uploader' });
    };

    return GlobalDocuments;
};
