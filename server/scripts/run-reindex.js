/**
 * Standalone embedding reindex — runs without needing the server.
 * Uses OPENAI_API_KEY from server/.env.
 *
 * Usage:
 *   node server/scripts/run-reindex.js                  # full reindex (all content)
 *   node server/scripts/run-reindex.js --global-only    # only past papers / global docs
 *   node server/scripts/run-reindex.js --global-only --subject economics
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const args    = process.argv.slice(2);
const GLOBAL_ONLY = args.includes('--global-only');
const SUBJECT_FILTER = (() => {
    const i = args.indexOf('--subject');
    return i !== -1 ? args[i + 1]?.toLowerCase() : null;
})();

async function reindexGlobalOnly(db, start) {
    const { indexGlobalDocument } = require('../services/embeddingSync');
    const { GlobalDocuments, ContentEmbeddings } = db;

    const where = {};
    if (SUBJECT_FILTER) where.subject = db.Sequelize.where(
        db.Sequelize.fn('LOWER', db.Sequelize.col('subject')),
        { [db.Sequelize.Op.like]: `%${SUBJECT_FILTER}%` }
    );

    // Only clear global_document embeddings (leave wiki/Q&A intact)
    const destroyWhere = { sourceType: 'global_document' };
    if (SUBJECT_FILTER) {
        const matchingIds = (await GlobalDocuments.findAll({ attributes: ['id'], where })).map(d => d.id);
        destroyWhere.sourceId = { [db.Sequelize.Op.in]: matchingIds };
    }
    await ContentEmbeddings.destroy({ where: destroyWhere });
    console.log(`Cleared existing global_document embeddings${SUBJECT_FILTER ? ` for subject '${SUBJECT_FILTER}'` : ''}.\n`);

    const docs = await GlobalDocuments.findAll({ attributes: ['id', 'chunksJson', 'subject'], where });
    console.log(`Indexing ${docs.length} global documents...\n`);

    const BATCH = 3;
    let indexed = 0, errors = 0;

    for (let i = 0; i < docs.length; i += BATCH) {
        const batch = docs.slice(i, i + BATCH);
        await Promise.all(batch.map(async doc => {
            try {
                if (!doc.chunksJson) return;
                const chunks = JSON.parse(doc.chunksJson);
                await indexGlobalDocument(doc.id, chunks, doc.subject, true);
                indexed++;
            } catch (err) {
                console.error(`\nEmbedding error for global_document/${doc.id}:`, err.message);
                errors++;
            }
        }));
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        process.stdout.write(`\r  [${elapsed}s] indexed=${indexed} errors=${errors} / ${docs.length}   `);
        if (i + BATCH < docs.length) await new Promise(r => setTimeout(r, 800));
    }

    return { indexed, errors };
}

async function main() {
    const db = require('../models');
    await db.sequelize.authenticate();
    console.log('DB connected.\n');

    const start = Date.now();

    let indexed, errors;

    if (GLOBAL_ONLY) {
        ({ indexed, errors } = await reindexGlobalOnly(db, start));
    } else {
        const { reindexAll } = require('../services/embeddingSync');
        ({ indexed, errors } = await reindexAll((progress) => {
            const elapsed = ((Date.now() - start) / 1000).toFixed(0);
            process.stdout.write(`\r  [${elapsed}s] indexed=${progress.indexed} errors=${progress.errors} (last: ${progress.type}/${progress.id})   `);
        }));
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n\nDone in ${elapsed}s — indexed: ${indexed}, errors: ${errors}`);

    await db.sequelize.close();
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
