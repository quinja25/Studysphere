'use strict';

module.exports = {
    async up(queryInterface) {
        // FULLTEXT indexes for RAG retrieval
        // Using raw SQL because Sequelize doesn't natively support FULLTEXT index creation

        // WikiArticles: search by title + content
        await queryInterface.sequelize.query(`
            ALTER TABLE WikiArticles ADD FULLTEXT INDEX ft_wiki_title_content (title, content)
        `).catch(() => { /* index may already exist */ });

        // Questions: search by title + body
        await queryInterface.sequelize.query(`
            ALTER TABLE Questions ADD FULLTEXT INDEX ft_questions_title_body (title, body)
        `).catch(() => {});

        // Posts: search by title + content
        await queryInterface.sequelize.query(`
            ALTER TABLE Posts ADD FULLTEXT INDEX ft_posts_title_content (title, content)
        `).catch(() => {});

        // Resources: search by title + description (NOT content — content is paid/gated)
        await queryInterface.sequelize.query(`
            ALTER TABLE Resources ADD FULLTEXT INDEX ft_resources_title_desc (title, description)
        `).catch(() => {});
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query('ALTER TABLE WikiArticles DROP INDEX ft_wiki_title_content').catch(() => {});
        await queryInterface.sequelize.query('ALTER TABLE Questions DROP INDEX ft_questions_title_body').catch(() => {});
        await queryInterface.sequelize.query('ALTER TABLE Posts DROP INDEX ft_posts_title_content').catch(() => {});
        await queryInterface.sequelize.query('ALTER TABLE Resources DROP INDEX ft_resources_title_desc').catch(() => {});
    }
};
