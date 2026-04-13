module.exports = (sequelize, DataTypes) => {
    const ContentEmbeddings = sequelize.define("ContentEmbeddings", {
        sourceType: {
            type: DataTypes.ENUM('wiki', 'question', 'answer', 'resource', 'post', 'document', 'global_document'),
            allowNull: false,
        },
        // null = platform content; userId = user-uploaded document scoped to that user
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        sourceId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        chunkIndex: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        chunkText: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        embedding: {
            type: DataTypes.BLOB('long'),
            allowNull: false,
        },
        tokenCount: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        subject: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    });

    return ContentEmbeddings;
};
