'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('ContentEmbeddings', {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            sourceType: {
                type: Sequelize.ENUM('wiki', 'question', 'answer', 'resource', 'post'),
                allowNull: false,
            },
            sourceId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            chunkIndex: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
            },
            chunkText: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            embedding: {
                type: Sequelize.BLOB('long'),
                allowNull: false,
            },
            tokenCount: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
            },
            subject: {
                type: Sequelize.STRING,
                allowNull: true,
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
            },
        });

        // Index for fast lookups and upserts
        await queryInterface.addIndex('ContentEmbeddings', ['sourceType', 'sourceId', 'chunkIndex'], {
            name: 'idx_embeddings_source',
        });
        await queryInterface.addIndex('ContentEmbeddings', ['subject'], {
            name: 'idx_embeddings_subject',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('ContentEmbeddings');
    }
};
