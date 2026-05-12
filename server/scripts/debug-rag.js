require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../models');

async function main() {
    await db.sequelize.authenticate();

    // 1. Count embeddings by sourceType
    const [counts] = await db.sequelize.query(`
        SELECT sourceType, COUNT(*) as cnt FROM ContentEmbeddings GROUP BY sourceType
    `);
    console.log('\n=== ContentEmbeddings by sourceType ===');
    console.table(counts);

    // 2. Sample a global_document embedding — check subject field
    const [sample] = await db.sequelize.query(`
        SELECT ce.sourceType, ce.sourceId, ce.subject, ce.chunkIndex,
               LENGTH(ce.embedding) as embLen,
               LEFT(ce.chunkText, 80) as chunkPreview
        FROM ContentEmbeddings ce
        WHERE ce.sourceType = 'global_document'
        LIMIT 5
    `);
    console.log('\n=== Sample global_document embeddings ===');
    console.table(sample);

    // 3. Check ContentEmbeddings columns
    const [cols] = await db.sequelize.query(`SHOW COLUMNS FROM ContentEmbeddings`);
    console.log('\n=== ContentEmbeddings columns ===');
    console.table(cols.map(c => ({ Field: c.Field, Type: c.Type })));

    // 4. Test retrieveContext directly
    console.log('\n=== Testing retrieveContext ===');
    const { retrieveContext } = require('../services/ragRetriever');
    const chunks = await retrieveContext(
        'Explain why the price elasticity of demand for cigarettes tends to be price inelastic',
        { subject: 'Economics', curriculum: 'IB', isPro: true }
    );
    console.log(`Retrieved ${chunks.length} chunks`);
    if (chunks.length > 0) {
        console.log('First chunk keys:', Object.keys(chunks[0]));
        console.log('First chunk preview:', JSON.stringify(chunks[0]).slice(0, 300));
    }

    await db.sequelize.close();
}

main().catch(e => { console.error(e); process.exit(1); });
