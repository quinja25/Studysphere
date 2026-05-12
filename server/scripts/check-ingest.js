require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../models');

db.sequelize.authenticate().then(async () => {
    const [rows] = await db.sequelize.query(`
        SELECT g.subject, g.curriculum,
               COUNT(*) as docs,
               SUM(g.chunkCount) as chunks
        FROM GlobalDocuments g
        GROUP BY g.subject, g.curriculum
        ORDER BY g.subject
    `);
    const [embRows] = await db.sequelize.query(`
        SELECT g.subject, COUNT(ce.id) as embedded_chunks
        FROM ContentEmbeddings ce
        JOIN GlobalDocuments g ON ce.sourceId = g.id AND ce.sourceType = 'global'
        GROUP BY g.subject
        ORDER BY g.subject
    `);
    console.log('\n=== Ingest (docs + chunks) ===');
    console.table(rows);
    console.log('\n=== Embeddings ===');
    console.table(embRows);
    await db.sequelize.close();
}).catch(e => { console.error(e.message); process.exit(1); });
